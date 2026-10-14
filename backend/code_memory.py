"""Memoria local persistente e incremental para conhecimento do codigo.

O modulo nao chama modelos de IA e nao indexa o projeto automaticamente. Cada
arquivo e atualizado somente quando o chamador o consulta ou envia novas
memorias por ``update_file_memory``.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping, Sequence


EXCLUDED_PATH_PARTS = frozenset(
    {
        ".git",
        ".mypy_cache",
        ".pytest_cache",
        ".ruff_cache",
        ".venv",
        "__pycache__",
        "build",
        "cache",
        "caches",
        "dist",
        "dist-mvp",
        "node_modules",
        "site-packages",
        "third_party",
        "vendor",
        "venv",
    }
)

ALLOWED_AGENT_MEMORY_TYPES = frozenset(
    {
        "architecture_decision",
        "error",
        "solution",
        "important_change",
        "test_result",
        "component_relationship",
    }
)

SENSITIVE_FILE_NAMES = frozenset(
    {"credentials.json", "secrets.json", "id_rsa", "id_ed25519"}
)
SENSITIVE_FILE_SUFFIXES = (".key", ".pem", ".p12", ".pfx")

_STOP_WORDS = frozenset(
    {
        "a",
        "as",
        "com",
        "da",
        "das",
        "de",
        "do",
        "dos",
        "e",
        "em",
        "o",
        "os",
        "para",
        "por",
        "um",
        "uma",
    }
)

_SECRET_PATTERNS = (
    re.compile(r"\bsk-[A-Za-z0-9_-]{12,}\b"),
    re.compile(r"\bAIza[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{12,}\b", re.IGNORECASE),
    re.compile(
        r"(?i)\b(api[_-]?key|access[_-]?token|secret|password)"
        r"\s*[:=]\s*['\"]?[^\s'\",;]+"
    ),
)


@dataclass(frozen=True)
class MemoryConfig:
    db_path: Path
    project_root: Path
    max_results: int = 10
    max_context_chars: int = 6000
    max_age_days: int | None = None
    min_confidence: float = 0.0

    @classmethod
    def from_env(
        cls,
        *,
        db_path: str | Path | None = None,
        project_root: str | Path | None = None,
    ) -> "MemoryConfig":
        root = Path(project_root or Path(__file__).resolve().parent).resolve()
        configured_db = Path(
            db_path
            or os.getenv("CODE_MEMORY_DB_PATH", "storage/code_memory.sqlite3")
        )
        if not configured_db.is_absolute():
            configured_db = root / configured_db
        max_age_raw = os.getenv("CODE_MEMORY_MAX_AGE_DAYS", "").strip()
        return cls(
            db_path=configured_db.resolve(),
            project_root=root,
            max_results=max(1, _env_int("CODE_MEMORY_MAX_RESULTS", 10)),
            max_context_chars=max(
                1, _env_int("CODE_MEMORY_MAX_CONTEXT_CHARS", 6000)
            ),
            max_age_days=(max(0, int(max_age_raw)) if max_age_raw else None),
            min_confidence=_clamp_confidence(
                _env_float("CODE_MEMORY_MIN_CONFIDENCE", 0.0)
            ),
        )


@dataclass(frozen=True)
class MemoryRecord:
    id: int
    memory_type: str
    content: str
    related_file: str | None
    related_symbol: str | None
    created_at: str
    updated_at: str
    file_hash: str | None
    confidence: float
    source: str
    is_stale: bool
    stale_at: str | None
    metadata: dict[str, Any]
    retrieval_count: int = 0
    last_retrieved_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class FileSnapshot:
    file_hash: str
    size_bytes: int
    characters: int
    estimated_tokens: int
    modified_ns: int
    reused_metrics: bool = False


class CodeMemory:
    """Repositorio SQLite de memorias de codigo com invalidacao por arquivo."""

    def __init__(
        self,
        db_path: str | Path | MemoryConfig | None = None,
        *,
        project_root: str | Path | None = None,
        config: MemoryConfig | None = None,
    ) -> None:
        if isinstance(db_path, MemoryConfig):
            if config is not None or project_root is not None:
                raise ValueError(
                    "MemoryConfig posicional nao pode ser combinado com config ou project_root"
                )
            config = db_path
            db_path = None
        self.config = config or MemoryConfig.from_env(
            db_path=db_path,
            project_root=project_root,
        )
        self.fts5_available = False
        self.config.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.config.db_path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    memory_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    related_file TEXT,
                    related_symbol TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    file_hash TEXT,
                    confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
                    source TEXT NOT NULL,
                    is_stale INTEGER NOT NULL DEFAULT 0 CHECK(is_stale IN (0, 1)),
                    stale_at TEXT,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    retrieval_count INTEGER NOT NULL DEFAULT 0,
                    last_retrieved_at TEXT
                );

                CREATE TABLE IF NOT EXISTS file_states (
                    related_file TEXT PRIMARY KEY,
                    file_hash TEXT NOT NULL,
                    checked_at TEXT NOT NULL,
                    file_size_bytes INTEGER NOT NULL DEFAULT 0,
                    file_characters INTEGER NOT NULL DEFAULT 0,
                    estimated_tokens INTEGER NOT NULL DEFAULT 0,
                    modified_ns INTEGER NOT NULL DEFAULT 0
                );

                CREATE INDEX IF NOT EXISTS idx_memories_file
                    ON memories(related_file, is_stale);
                CREATE INDEX IF NOT EXISTS idx_memories_type
                    ON memories(memory_type, is_stale);
                CREATE INDEX IF NOT EXISTS idx_memories_confidence
                    ON memories(confidence, is_stale);
                CREATE INDEX IF NOT EXISTS idx_memories_updated
                    ON memories(updated_at, is_stale);

                PRAGMA user_version = 2;
                """
            )
            self._ensure_column(
                connection, "memories", "retrieval_count", "INTEGER NOT NULL DEFAULT 0"
            )
            self._ensure_column(
                connection, "memories", "last_retrieved_at", "TEXT"
            )
            for name, definition in (
                ("file_size_bytes", "INTEGER NOT NULL DEFAULT 0"),
                ("file_characters", "INTEGER NOT NULL DEFAULT 0"),
                ("estimated_tokens", "INTEGER NOT NULL DEFAULT 0"),
                ("modified_ns", "INTEGER NOT NULL DEFAULT 0"),
            ):
                self._ensure_column(connection, "file_states", name, definition)
            self.fts5_available = self._initialize_fts5(connection)

    @staticmethod
    def _ensure_column(
        connection: sqlite3.Connection,
        table: str,
        column: str,
        definition: str,
    ) -> None:
        columns = {
            str(row["name"])
            for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
        }
        if column not in columns:
            connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    @staticmethod
    def _initialize_fts5(connection: sqlite3.Connection) -> bool:
        try:
            connection.executescript(
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
                    memory_id UNINDEXED,
                    content,
                    memory_type,
                    related_file,
                    related_symbol,
                    tokenize='unicode61 remove_diacritics 2'
                );
                CREATE TRIGGER IF NOT EXISTS memories_fts_insert
                AFTER INSERT ON memories BEGIN
                    INSERT INTO memories_fts(
                        memory_id, content, memory_type, related_file, related_symbol
                    ) VALUES (
                        new.id, new.content, new.memory_type,
                        COALESCE(new.related_file, ''), COALESCE(new.related_symbol, '')
                    );
                END;
                CREATE TRIGGER IF NOT EXISTS memories_fts_update
                AFTER UPDATE ON memories BEGIN
                    DELETE FROM memories_fts WHERE memory_id = old.id;
                    INSERT INTO memories_fts(
                        memory_id, content, memory_type, related_file, related_symbol
                    ) VALUES (
                        new.id, new.content, new.memory_type,
                        COALESCE(new.related_file, ''), COALESCE(new.related_symbol, '')
                    );
                END;
                CREATE TRIGGER IF NOT EXISTS memories_fts_delete
                AFTER DELETE ON memories BEGIN
                    DELETE FROM memories_fts WHERE memory_id = old.id;
                END;
                """
            )
            connection.execute(
                """
                INSERT INTO memories_fts(
                    memory_id, content, memory_type, related_file, related_symbol
                )
                SELECT m.id, m.content, m.memory_type,
                       COALESCE(m.related_file, ''), COALESCE(m.related_symbol, '')
                  FROM memories m
                 WHERE NOT EXISTS (
                    SELECT 1 FROM memories_fts f WHERE f.memory_id = m.id
                 )
                """
            )
            return True
        except sqlite3.OperationalError:
            return False

    def remember(
        self,
        memory_type: str,
        content: str,
        *,
        related_file: str | Path | None = None,
        related_symbol: str | None = None,
        confidence: float = 1.0,
        source: str = "manual",
        metadata: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        normalized_file: str | None = None
        file_hash: str | None = None
        resolved_file: Path | None = None
        if related_file is not None:
            normalized_file, resolved_file = self._normalize_file(related_file)

        now = _utc_now()
        safe_content = _redact_secrets(str(content).strip())
        if not memory_type.strip() or not safe_content:
            raise ValueError("memory_type e content sao obrigatorios")
        confidence = _clamp_confidence(confidence)
        safe_metadata = json.dumps(dict(metadata or {}), ensure_ascii=False)

        with self._connect() as connection:
            if normalized_file and resolved_file:
                previous_state = connection.execute(
                    "SELECT * FROM file_states WHERE related_file = ?",
                    (normalized_file,),
                ).fetchone()
                snapshot = _inspect_file(resolved_file, previous_state)
                if snapshot.file_hash == "__missing__":
                    raise FileNotFoundError(resolved_file)
                file_hash = snapshot.file_hash
                self._upsert_file_state(connection, normalized_file, snapshot, now)
            existing = connection.execute(
                """
                SELECT id FROM memories
                 WHERE memory_type = ? AND content = ?
                   AND related_file IS ? AND related_symbol IS ?
                   AND file_hash IS ? AND is_stale = 0
                 LIMIT 1
                """,
                (
                    memory_type.strip(),
                    safe_content,
                    normalized_file,
                    related_symbol,
                    file_hash,
                ),
            ).fetchone()
            if existing:
                connection.execute(
                    """
                    UPDATE memories
                       SET updated_at = ?, confidence = ?, source = ?, metadata_json = ?
                     WHERE id = ?
                    """,
                    (now, confidence, source, safe_metadata, existing["id"]),
                )
                memory_id = int(existing["id"])
            else:
                cursor = connection.execute(
                    """
                    INSERT INTO memories (
                        memory_type, content, related_file, related_symbol,
                        created_at, updated_at, file_hash, confidence, source,
                        is_stale, stale_at, metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
                    """,
                    (
                        memory_type.strip(),
                        safe_content,
                        normalized_file,
                        related_symbol,
                        now,
                        now,
                        file_hash,
                        confidence,
                        source,
                        safe_metadata,
                    ),
                )
                memory_id = int(cursor.lastrowid)
            row = connection.execute(
                "SELECT * FROM memories WHERE id = ?", (memory_id,)
            ).fetchone()
        return _row_to_record(row).to_dict()

    def search_memory(
        self,
        query: str,
        *,
        limit: int | None = None,
        max_context_chars: int | None = None,
        max_age_days: int | None = None,
        min_confidence: float | None = None,
    ) -> list[dict[str, Any]]:
        result_limit = min(
            max(1, limit or self.config.max_results),
            self.config.max_results,
        )
        context_limit = min(
            max(1, max_context_chars or self.config.max_context_chars),
            self.config.max_context_chars,
        )
        confidence_floor = _clamp_confidence(
            self.config.min_confidence
            if min_confidence is None
            else min_confidence
        )
        age_days = self.config.max_age_days if max_age_days is None else max_age_days

        clauses = ["is_stale = 0", "confidence >= ?"]
        params: list[Any] = [confidence_floor]
        if age_days is not None:
            cutoff = datetime.now(timezone.utc) - timedelta(days=max(0, age_days))
            clauses.append("updated_at >= ?")
            params.append(cutoff.isoformat())

        terms = _query_terms(query)
        fts_scores: dict[int, float] = {}
        with self._connect() as connection:
            rows: list[sqlite3.Row]
            if terms and self.fts5_available:
                try:
                    fts_query = " OR ".join(
                        f'"{term.replace(chr(34), chr(34) * 2)}"' for term in terms
                    )
                    fts_rows = connection.execute(
                        """
                        SELECT CAST(memory_id AS INTEGER) AS memory_id,
                               bm25(memories_fts) AS rank
                          FROM memories_fts
                         WHERE memories_fts MATCH ?
                         ORDER BY rank LIMIT 500
                        """,
                        (fts_query,),
                    ).fetchall()
                    memory_ids = [int(row["memory_id"]) for row in fts_rows]
                    fts_scores = {
                        int(row["memory_id"]): -float(row["rank"] or 0.0)
                        for row in fts_rows
                    }
                    if memory_ids:
                        placeholders = ",".join("?" for _ in memory_ids)
                        sql = (
                            "SELECT * FROM memories WHERE "
                            + " AND ".join(clauses)
                            + f" AND id IN ({placeholders}) LIMIT 500"
                        )
                        rows = connection.execute(sql, [*params, *memory_ids]).fetchall()
                    else:
                        rows = []
                except sqlite3.OperationalError:
                    self.fts5_available = False
                    rows = self._search_like(connection, clauses, params, terms)
            else:
                rows = self._search_like(connection, clauses, params, terms)

        phrase = query.strip().lower()
        ranked: list[tuple[float, MemoryRecord]] = []
        for row in rows:
            record = _row_to_record(row)
            searchable = " ".join(
                part
                for part in (
                    record.memory_type,
                    record.content,
                    record.related_file or "",
                    record.related_symbol or "",
                )
                if part
            ).lower()
            matched = sum(1 for term in terms if term in searchable)
            term_score = matched / max(1, len(terms))
            phrase_score = 1.0 if phrase and phrase in searchable else 0.0
            relevance = (
                phrase_score
                + term_score
                + record.confidence * 0.25
                + fts_scores.get(record.id, 0.0)
            )
            ranked.append((relevance, record))
        ranked.sort(key=lambda item: (item[0], item[1].updated_at), reverse=True)

        results: list[dict[str, Any]] = []
        used_chars = 0
        for relevance, record in ranked:
            if len(results) >= result_limit or used_chars >= context_limit:
                break
            item = record.to_dict()
            remaining = context_limit - used_chars
            original = item["content"]
            item["original_content_chars"] = len(original)
            if len(original) > remaining:
                item["content"] = original[:remaining]
                item["content_truncated"] = True
            else:
                item["content_truncated"] = False
            used_chars += len(item["content"])
            item["relevance_score"] = round(relevance, 6)
            results.append(item)
        return results

    @staticmethod
    def _search_like(
        connection: sqlite3.Connection,
        clauses: Sequence[str],
        params: Sequence[Any],
        terms: Sequence[str],
    ) -> list[sqlite3.Row]:
        fallback_clauses = list(clauses)
        fallback_params = list(params)
        if terms:
            term_clauses: list[str] = []
            for term in terms:
                term_clauses.append(
                    "(LOWER(content) LIKE ? OR LOWER(COALESCE(related_file, '')) LIKE ? "
                    "OR LOWER(COALESCE(related_symbol, '')) LIKE ? "
                    "OR LOWER(memory_type) LIKE ?)"
                )
                token = f"%{term}%"
                fallback_params.extend([token, token, token, token])
            fallback_clauses.append("(" + " OR ".join(term_clauses) + ")")
        sql = (
            "SELECT * FROM memories WHERE "
            + " AND ".join(fallback_clauses)
            + " ORDER BY updated_at DESC LIMIT 500"
        )
        return connection.execute(sql, fallback_params).fetchall()

    def get_file_memory(
        self,
        file_path: str | Path,
        *,
        include_stale: bool = False,
    ) -> list[dict[str, Any]]:
        normalized_file, resolved_file = self._normalize_file(file_path)
        now = _utc_now()

        with self._connect() as connection:
            state = connection.execute(
                "SELECT * FROM file_states WHERE related_file = ?",
                (normalized_file,),
            ).fetchone()
            snapshot = _inspect_file(resolved_file, state)
            saved_hash = state["file_hash"] if state else None
            comparable_hash = snapshot.file_hash
            if saved_hash is not None and saved_hash != comparable_hash:
                self._mark_file_stale(connection, normalized_file, now)
                self._upsert_file_state(connection, normalized_file, snapshot, now)
                return []
            if saved_hash is None:
                self._upsert_file_state(connection, normalized_file, snapshot, now)

            sql = "SELECT * FROM memories WHERE related_file = ?"
            params: list[Any] = [normalized_file]
            if not include_stale:
                sql += " AND is_stale = 0"
            sql += " ORDER BY updated_at DESC"
            rows = connection.execute(sql, params).fetchall()
        return [_row_to_record(row).to_dict() for row in rows]

    def update_file_memory(
        self,
        file_path: str | Path,
        memories: Iterable[Mapping[str, Any]],
        *,
        source: str = "code_analysis",
        force: bool = False,
    ) -> dict[str, Any]:
        normalized_file, resolved_file = self._normalize_file(file_path)
        items = list(memories)
        now = _utc_now()

        with self._connect() as connection:
            state = connection.execute(
                "SELECT * FROM file_states WHERE related_file = ?",
                (normalized_file,),
            ).fetchone()
            snapshot = _inspect_file(resolved_file, state)
            if snapshot.file_hash == "__missing__":
                raise FileNotFoundError(resolved_file)
            current_hash = snapshot.file_hash
            active_count = int(
                connection.execute(
                    "SELECT COUNT(*) FROM memories WHERE related_file = ? AND is_stale = 0",
                    (normalized_file,),
                ).fetchone()[0]
            )
            unchanged = bool(state and state["file_hash"] == current_hash)
            if unchanged and active_count and not force:
                return {
                    "file": normalized_file,
                    "file_hash": current_hash,
                    "file_size_bytes": snapshot.size_bytes,
                    "file_characters": snapshot.characters,
                    "estimated_tokens": snapshot.estimated_tokens,
                    "reused_file_metrics": snapshot.reused_metrics,
                    "changed": False,
                    "reused": True,
                    "invalidated": 0,
                    "created": 0,
                    "active_memories": active_count,
                }

            invalidated = 0
            if state and state["file_hash"] != current_hash:
                invalidated = self._mark_file_stale(
                    connection, normalized_file, now
                )
            elif force and active_count:
                invalidated = self._mark_file_stale(
                    connection, normalized_file, now
                )
            self._upsert_file_state(connection, normalized_file, snapshot, now)

        created = 0
        for item in items:
            self.remember(
                str(item.get("memory_type") or item.get("type") or "knowledge"),
                str(item.get("content") or ""),
                related_file=resolved_file,
                related_symbol=item.get("related_symbol") or item.get("symbol"),
                confidence=float(item.get("confidence", 1.0)),
                source=str(item.get("source") or source),
                metadata=item.get("metadata") or {},
            )
            created += 1
        return {
            "file": normalized_file,
            "file_hash": current_hash,
            "file_size_bytes": snapshot.size_bytes,
            "file_characters": snapshot.characters,
            "estimated_tokens": snapshot.estimated_tokens,
            "reused_file_metrics": snapshot.reused_metrics,
            "changed": not unchanged,
            "reused": False,
            "invalidated": invalidated,
            "created": created,
            "active_memories": created,
        }

    def forget_stale_memory(self, *, older_than_days: int | None = None) -> int:
        with self._connect() as connection:
            if older_than_days is None:
                cursor = connection.execute(
                    "DELETE FROM memories WHERE is_stale = 1"
                )
            else:
                cutoff = datetime.now(timezone.utc) - timedelta(
                    days=max(0, older_than_days)
                )
                cursor = connection.execute(
                    """
                    DELETE FROM memories
                     WHERE is_stale = 1 AND COALESCE(stale_at, updated_at) <= ?
                    """,
                    (cutoff.isoformat(),),
                )
        return max(0, int(cursor.rowcount))

    def find_useless_memory(
        self,
        *,
        low_confidence_threshold: float = 0.3,
        never_retrieved_days: int = 30,
    ) -> list[dict[str, Any]]:
        """Classifica candidatos a limpeza sem excluir dados automaticamente."""
        cutoff = datetime.now(timezone.utc) - timedelta(
            days=max(0, never_retrieved_days)
        )
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM memories ORDER BY updated_at ASC"
            ).fetchall()
        candidates: list[dict[str, Any]] = []
        for row in rows:
            record = _row_to_record(row).to_dict()
            reasons: list[str] = []
            if record["is_stale"]:
                reasons.append("superseded_or_stale")
            if float(record["confidence"]) < _clamp_confidence(
                low_confidence_threshold
            ):
                reasons.append("low_confidence")
            try:
                created_at = datetime.fromisoformat(record["created_at"])
            except ValueError:
                created_at = datetime.now(timezone.utc)
            if int(record["retrieval_count"]) == 0 and created_at <= cutoff:
                reasons.append("never_retrieved")
            related_file = record.get("related_file")
            if related_file and not (self.config.project_root / related_file).is_file():
                reasons.append("file_removed")
            if reasons:
                record["useless_reasons"] = reasons
                candidates.append(record)
        return candidates

    def format_context(
        self,
        memories: Sequence[Mapping[str, Any]],
        *,
        max_context_chars: int | None = None,
    ) -> str:
        limit = min(
            max_context_chars or self.config.max_context_chars,
            self.config.max_context_chars,
        )
        blocks: list[str] = []
        used = 0
        for memory in memories:
            location = str(memory.get("related_file") or "projeto")
            symbol = memory.get("related_symbol")
            if symbol:
                location += f"#{symbol}"
            block = (
                f"[{memory.get('memory_type', 'knowledge')}] {location}\n"
                f"{memory.get('content', '')}"
            )
            separator = "\n\n" if blocks else ""
            remaining = limit - used - len(separator)
            if remaining <= 0:
                break
            blocks.append(block[:remaining])
            used += len(separator) + min(len(block), remaining)
        return "\n\n".join(blocks)

    def build_task_context(
        self,
        query: str,
        *,
        files: Sequence[str | Path] | None = None,
        symbols: Sequence[str] | None = None,
        limit: int | None = None,
        max_context_chars: int | None = None,
        max_age_days: int | None = None,
        min_confidence: float | None = None,
        existing_text: str = "",
    ) -> dict[str, Any]:
        """Recupera e ordena um contexto pequeno para uma tarefa especifica."""
        result_limit = min(max(1, limit or self.config.max_results), self.config.max_results)
        context_limit = min(
            max(1, max_context_chars or self.config.max_context_chars),
            self.config.max_context_chars,
        )
        requested_files: set[str] = set()
        candidates: list[dict[str, Any]] = []

        for file_path in files or ():
            try:
                normalized_file, _ = self._normalize_file(file_path)
                requested_files.add(normalized_file)
                candidates.extend(self.get_file_memory(file_path))
            except (FileNotFoundError, ValueError, OSError):
                continue

        requested_symbols = {
            str(symbol).strip().casefold() for symbol in symbols or () if str(symbol).strip()
        }
        confidence_floor = _clamp_confidence(
            self.config.min_confidence if min_confidence is None else min_confidence
        )
        age_days = self.config.max_age_days if max_age_days is None else max_age_days
        cutoff = (
            datetime.now(timezone.utc) - timedelta(days=max(0, age_days))
            if age_days is not None
            else None
        )
        for symbol in requested_symbols:
            candidates.extend(
                self.search_memory(
                    symbol,
                    limit=self.config.max_results,
                    max_context_chars=self.config.max_context_chars,
                    max_age_days=max_age_days,
                    min_confidence=min_confidence,
                )
            )
        if query.strip():
            candidates.extend(
                self.search_memory(
                    query,
                    limit=self.config.max_results,
                    max_context_chars=self.config.max_context_chars,
                    max_age_days=max_age_days,
                    min_confidence=min_confidence,
                )
            )

        unique: list[dict[str, Any]] = []
        seen_ids: set[int] = set()
        seen_content: set[str] = set()
        duplicates_skipped = 0
        for candidate in candidates:
            if candidate.get("is_stale"):
                continue
            if float(candidate.get("confidence") or 0.0) < confidence_floor:
                continue
            if cutoff is not None:
                try:
                    updated_at = datetime.fromisoformat(str(candidate.get("updated_at") or ""))
                except ValueError:
                    continue
                if updated_at < cutoff:
                    continue
            content_key = _normalize_comparable_text(str(candidate.get("content") or ""))
            memory_id = int(candidate.get("id") or 0)
            if not content_key or memory_id in seen_ids or content_key in seen_content:
                duplicates_skipped += 1
                continue
            seen_ids.add(memory_id)
            seen_content.add(content_key)
            item = dict(candidate)
            item.setdefault("original_content_chars", len(str(item.get("content") or "")))
            unique.append(item)

        unique.sort(
            key=lambda item: (
                1 if item.get("related_file") in requested_files else 0,
                1
                if str(item.get("related_symbol") or "").casefold() in requested_symbols
                else 0,
                float(item.get("relevance_score") or 0.0),
                float(item.get("confidence") or 0.0),
                str(item.get("updated_at") or ""),
            ),
            reverse=True,
        )

        original_memory_chars = sum(
            int(item.get("original_content_chars") or len(str(item.get("content") or "")))
            for item in unique
        )
        existing_key = _normalize_comparable_text(existing_text)
        selected: list[dict[str, Any]] = []
        blocks: list[str] = []
        used_chars = 0
        for item in unique:
            if len(selected) >= result_limit:
                break
            content = str(item.get("content") or "")
            content_key = _normalize_comparable_text(content)
            if content_key and content_key in existing_key:
                duplicates_skipped += 1
                continue
            location = str(item.get("related_file") or "projeto")
            if item.get("related_symbol"):
                location += f"#{item['related_symbol']}"
            header = f"[{item.get('memory_type', 'knowledge')}] {location}\n"
            separator = "\n\n" if blocks else ""
            remaining = context_limit - used_chars - len(separator)
            if remaining <= len(header):
                break
            allowed_content = remaining - len(header)
            selected_item = dict(item)
            selected_item["content"] = content[:allowed_content]
            selected_item["content_truncated"] = len(content) > allowed_content
            block = header + selected_item["content"]
            selected.append(selected_item)
            blocks.append(block)
            used_chars += len(separator) + len(block)

        context = "\n\n".join(blocks)
        selected_ids = [int(item["id"]) for item in selected if item.get("id")]
        if selected_ids:
            placeholders = ",".join("?" for _ in selected_ids)
            with self._connect() as connection:
                connection.execute(
                    f"""
                    UPDATE memories
                       SET retrieval_count = retrieval_count + 1,
                           last_retrieved_at = ?
                     WHERE id IN ({placeholders})
                    """,
                    [_utc_now(), *selected_ids],
                )
        return {
            "query": query,
            "context": context,
            "memories": selected,
            "memory_results": len(selected),
            "memory_context_chars": len(context),
            "retrieved_candidates": len(unique),
            "original_memory_chars": original_memory_chars,
            "duplicates_skipped": duplicates_skipped,
        }

    def _normalize_file(self, file_path: str | Path) -> tuple[str, Path]:
        candidate = Path(file_path)
        if not candidate.is_absolute():
            candidate = self.config.project_root / candidate
        resolved = candidate.resolve()
        try:
            relative = resolved.relative_to(self.config.project_root)
        except ValueError as exc:
            raise ValueError("O arquivo deve estar dentro do projeto") from exc
        lowered = {part.lower() for part in relative.parts}
        file_name = relative.name.lower()
        if lowered & EXCLUDED_PATH_PARTS or any(
            part.endswith((".dist-info", ".egg-info")) for part in lowered
        ):
            raise ValueError(f"Caminho excluido da memoria: {relative.as_posix()}")
        if (
            file_name == ".env"
            or file_name.startswith(".env.")
            or file_name in SENSITIVE_FILE_NAMES
            or file_name.endswith(SENSITIVE_FILE_SUFFIXES)
        ):
            raise ValueError(f"Arquivo sensivel excluido da memoria: {relative.as_posix()}")
        return relative.as_posix(), resolved

    @staticmethod
    def _upsert_file_state(
        connection: sqlite3.Connection,
        related_file: str,
        snapshot: FileSnapshot,
        checked_at: str,
    ) -> None:
        connection.execute(
            """
            INSERT INTO file_states(
                related_file, file_hash, checked_at, file_size_bytes,
                file_characters, estimated_tokens, modified_ns
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(related_file) DO UPDATE SET
                file_hash = excluded.file_hash,
                checked_at = excluded.checked_at,
                file_size_bytes = excluded.file_size_bytes,
                file_characters = excluded.file_characters,
                estimated_tokens = excluded.estimated_tokens,
                modified_ns = excluded.modified_ns
            """,
            (
                related_file,
                snapshot.file_hash,
                checked_at,
                snapshot.size_bytes,
                snapshot.characters,
                snapshot.estimated_tokens,
                snapshot.modified_ns,
            ),
        )

    @staticmethod
    def _mark_file_stale(
        connection: sqlite3.Connection,
        related_file: str,
        stale_at: str,
    ) -> int:
        cursor = connection.execute(
            """
            UPDATE memories
               SET is_stale = 1, stale_at = ?, updated_at = ?
             WHERE related_file = ? AND is_stale = 0
            """,
            (stale_at, stale_at, related_file),
        )
        return max(0, int(cursor.rowcount))


def _row_to_record(row: sqlite3.Row) -> MemoryRecord:
    return MemoryRecord(
        id=int(row["id"]),
        memory_type=str(row["memory_type"]),
        content=str(row["content"]),
        related_file=row["related_file"],
        related_symbol=row["related_symbol"],
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
        file_hash=row["file_hash"],
        confidence=float(row["confidence"]),
        source=str(row["source"]),
        is_stale=bool(row["is_stale"]),
        stale_at=row["stale_at"],
        metadata=json.loads(row["metadata_json"] or "{}"),
        retrieval_count=int(row["retrieval_count"] or 0),
        last_retrieved_at=row["last_retrieved_at"],
    )


def _inspect_file(
    path: Path,
    previous_state: sqlite3.Row | None = None,
) -> FileSnapshot:
    if not path.is_file():
        return FileSnapshot("__missing__", 0, 0, 0, 0)
    stat = path.stat()
    if (
        previous_state is not None
        and int(previous_state["file_size_bytes"] or 0) == stat.st_size
        and int(previous_state["modified_ns"] or 0) == stat.st_mtime_ns
    ):
        return FileSnapshot(
            str(previous_state["file_hash"]),
            int(previous_state["file_size_bytes"] or 0),
            int(previous_state["file_characters"] or 0),
            int(previous_state["estimated_tokens"] or 0),
            int(previous_state["modified_ns"] or 0),
            reused_metrics=True,
        )
    data = path.read_bytes()
    characters = len(data.decode("utf-8", errors="replace"))
    return FileSnapshot(
        hashlib.sha256(data).hexdigest(),
        len(data),
        characters,
        (characters + 3) // 4,
        stat.st_mtime_ns,
    )


def _hash_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _query_terms(query: str) -> list[str]:
    tokens = re.findall(r"[\w.-]+", query.lower(), flags=re.UNICODE)
    return list(dict.fromkeys(token for token in tokens if token not in _STOP_WORDS))


def _redact_secrets(content: str) -> str:
    safe = content
    for pattern in _SECRET_PATTERNS:
        safe = pattern.sub("[REDACTED]", safe)
    return safe


def _normalize_comparable_text(content: str) -> str:
    return " ".join(content.casefold().split())


def _clamp_confidence(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)).replace(",", "."))
    except ValueError:
        return default


def _default_memory() -> CodeMemory:
    return CodeMemory()


def remember(
    memory_type: str,
    content: str,
    **kwargs: Any,
) -> dict[str, Any]:
    return _default_memory().remember(memory_type, content, **kwargs)


def search_memory(query: str, **kwargs: Any) -> list[dict[str, Any]]:
    return _default_memory().search_memory(query, **kwargs)


def get_file_memory(
    file_path: str | Path,
    **kwargs: Any,
) -> list[dict[str, Any]]:
    return _default_memory().get_file_memory(file_path, **kwargs)


def update_file_memory(
    file_path: str | Path,
    memories: Iterable[Mapping[str, Any]],
    **kwargs: Any,
) -> dict[str, Any]:
    return _default_memory().update_file_memory(file_path, memories, **kwargs)


def forget_stale_memory(**kwargs: Any) -> int:
    return _default_memory().forget_stale_memory(**kwargs)


def build_task_context(query: str, **kwargs: Any) -> dict[str, Any]:
    return _default_memory().build_task_context(query, **kwargs)


def _remember_event(
    memory_type: str,
    *,
    content: str,
    file_path: str | Path | None = None,
    symbol: str | None = None,
    confidence: float = 1.0,
    source: str = "agent_event",
    memory: CodeMemory | None = None,
    metadata: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    store = memory or _default_memory()
    return store.remember(
        memory_type,
        content,
        related_file=file_path,
        related_symbol=symbol,
        confidence=confidence,
        source=source,
        metadata=metadata,
    )


def remember_decision(**kwargs: Any) -> dict[str, Any]:
    return _remember_event("decision", **kwargs)


def remember_error(**kwargs: Any) -> dict[str, Any]:
    return _remember_event("error", **kwargs)


def remember_solution(**kwargs: Any) -> dict[str, Any]:
    return _remember_event("solution", **kwargs)


def remember_architecture(**kwargs: Any) -> dict[str, Any]:
    return _remember_event("architecture", **kwargs)


def remember_task_events(
    events: Iterable[Mapping[str, Any]],
    *,
    memory: CodeMemory | None = None,
) -> list[dict[str, Any]]:
    """Persiste somente eventos estruturados fornecidos explicitamente."""
    store = memory or _default_memory()
    saved: list[dict[str, Any]] = []
    for event in events:
        event_type = str(event.get("type") or "").strip().lower()
        if event_type not in ALLOWED_AGENT_MEMORY_TYPES:
            raise ValueError(f"Tipo de memoria automatica nao permitido: {event_type}")
        if "confidence" not in event:
            raise ValueError("Memoria automatica exige confidence explicita")
        content = str(event.get("content") or "").strip()
        if not content:
            raise ValueError("Memoria automatica exige content estruturado")
        saved.append(
            store.remember(
                event_type,
                content,
                related_file=event.get("file_path"),
                related_symbol=event.get("symbol"),
                confidence=float(event["confidence"]),
                source="agent_generated",
                metadata={"event_schema": 1},
            )
        )
    return saved


def find_useless_memory(**kwargs: Any) -> list[dict[str, Any]]:
    return _default_memory().find_useless_memory(**kwargs)


__all__ = [
    "CodeMemory",
    "EXCLUDED_PATH_PARTS",
    "ALLOWED_AGENT_MEMORY_TYPES",
    "MemoryConfig",
    "MemoryRecord",
    "build_task_context",
    "forget_stale_memory",
    "find_useless_memory",
    "get_file_memory",
    "remember",
    "remember_architecture",
    "remember_decision",
    "remember_error",
    "remember_solution",
    "remember_task_events",
    "search_memory",
    "update_file_memory",
]
