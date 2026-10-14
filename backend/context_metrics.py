"""Metricas locais e estimadas para comparar tamanhos de contexto.

As estimativas deste modulo nao substituem a contagem real retornada por um
provedor. O calculo padrao usa quatro caracteres por token e nao faz chamadas
externas nem exige um tokenizer adicional.
"""

from __future__ import annotations

import math
import sqlite3
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterator, Mapping, Sequence


DEFAULT_CHARACTERS_PER_TOKEN = 4.0
ESTIMATION_METHOD = "estimated_chars_divided_by_4"


@dataclass(frozen=True)
class ContextMetrics:
    original_chars: int
    sent_chars: int
    estimated_original_tokens: int
    estimated_sent_tokens: int
    estimated_tokens_saved: int
    estimated_reduction_percent: float
    estimation_method: str = ESTIMATION_METHOD

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def estimate_tokens(
    text_or_characters: str | int,
    *,
    characters_per_token: float = DEFAULT_CHARACTERS_PER_TOKEN,
) -> int:
    """Estima tokens localmente; resultados reais do provedor prevalecem."""
    if characters_per_token <= 0:
        raise ValueError("characters_per_token deve ser maior que zero")
    characters = (
        len(text_or_characters)
        if isinstance(text_or_characters, str)
        else max(0, int(text_or_characters))
    )
    if characters == 0:
        return 0
    return int(math.ceil(characters / characters_per_token))


def measure_context_reduction(
    original: str | int,
    sent: str | int,
    *,
    characters_per_token: float = DEFAULT_CHARACTERS_PER_TOKEN,
) -> ContextMetrics:
    """Compara um contexto bruto com o contexto efetivamente preparado."""
    original_chars = len(original) if isinstance(original, str) else max(0, int(original))
    sent_chars = len(sent) if isinstance(sent, str) else max(0, int(sent))
    original_tokens = estimate_tokens(
        original_chars, characters_per_token=characters_per_token
    )
    sent_tokens = estimate_tokens(sent_chars, characters_per_token=characters_per_token)
    saved = max(0, original_tokens - sent_tokens)
    reduction = (saved / original_tokens * 100.0) if original_tokens else 0.0
    return ContextMetrics(
        original_chars=original_chars,
        sent_chars=sent_chars,
        estimated_original_tokens=original_tokens,
        estimated_sent_tokens=sent_tokens,
        estimated_tokens_saved=saved,
        estimated_reduction_percent=round(reduction, 2),
    )


def count_message_characters(messages: Sequence[Mapping[str, Any]]) -> int:
    """Conta somente texto enviado nas mensagens, sem persistir seu conteudo."""
    return sum(_count_text(message.get("content")) for message in messages)


def message_text(messages: Sequence[Mapping[str, Any]]) -> str:
    """Extrai texto apenas para deduplicacao em memoria durante a chamada."""
    parts: list[str] = []
    for message in messages:
        _collect_text(message.get("content"), parts)
    return "\n".join(parts)


class SavingsTracker:
    """Persiste apenas metricas agregaveis; nunca salva prompts ou memorias."""

    def __init__(self, db_path: str | Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.db_path, timeout=10)
        connection.row_factory = sqlite3.Row
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
                CREATE TABLE IF NOT EXISTS context_savings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    task_type TEXT NOT NULL,
                    tier TEXT NOT NULL,
                    model TEXT NOT NULL,
                    memory_used INTEGER NOT NULL CHECK(memory_used IN (0, 1)),
                    original_chars INTEGER NOT NULL,
                    sent_chars INTEGER NOT NULL,
                    estimated_original_tokens INTEGER NOT NULL,
                    estimated_sent_tokens INTEGER NOT NULL,
                    estimated_tokens_saved INTEGER NOT NULL,
                    estimated_reduction_percent REAL NOT NULL,
                    provider_input_tokens INTEGER,
                    estimation_error_percent REAL,
                    estimation_method TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS context_savings_files (
                    call_id INTEGER NOT NULL,
                    related_file TEXT NOT NULL,
                    allocated_tokens_saved REAL NOT NULL,
                    FOREIGN KEY(call_id) REFERENCES context_savings(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_savings_task
                    ON context_savings(task_type);
                CREATE INDEX IF NOT EXISTS idx_savings_model
                    ON context_savings(model, tier);
                CREATE INDEX IF NOT EXISTS idx_savings_file
                    ON context_savings_files(related_file);
                """
            )

    def record(
        self,
        metrics: ContextMetrics,
        *,
        timestamp: str,
        task_type: str,
        tier: str,
        model: str,
        memory_used: bool,
        provider_input_tokens: int | None = None,
        related_files: Sequence[str] | None = None,
    ) -> dict[str, Any]:
        provider_tokens = (
            max(0, int(provider_input_tokens))
            if provider_input_tokens is not None and int(provider_input_tokens) > 0
            else None
        )
        error_percent = (
            round(
                abs(metrics.estimated_sent_tokens - provider_tokens)
                / provider_tokens
                * 100.0,
                2,
            )
            if provider_tokens
            else None
        )
        files = list(dict.fromkeys(str(item) for item in related_files or () if item))
        with self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO context_savings (
                    timestamp, task_type, tier, model, memory_used,
                    original_chars, sent_chars, estimated_original_tokens,
                    estimated_sent_tokens, estimated_tokens_saved,
                    estimated_reduction_percent, provider_input_tokens,
                    estimation_error_percent, estimation_method
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    timestamp,
                    task_type,
                    tier,
                    model,
                    int(memory_used),
                    metrics.original_chars,
                    metrics.sent_chars,
                    metrics.estimated_original_tokens,
                    metrics.estimated_sent_tokens,
                    metrics.estimated_tokens_saved,
                    metrics.estimated_reduction_percent,
                    provider_tokens,
                    error_percent,
                    metrics.estimation_method,
                ),
            )
            call_id = int(cursor.lastrowid)
            allocation = metrics.estimated_tokens_saved / len(files) if files else 0.0
            connection.executemany(
                """
                INSERT INTO context_savings_files(
                    call_id, related_file, allocated_tokens_saved
                ) VALUES (?, ?, ?)
                """,
                [(call_id, related_file, allocation) for related_file in files],
            )
        return {
            "id": call_id,
            "provider_input_tokens": provider_tokens,
            "estimation_error_percent": error_percent,
        }

    def report(self) -> dict[str, Any]:
        with self._connect() as connection:
            totals = connection.execute(
                """
                SELECT COUNT(*) AS calls_analyzed,
                       SUM(memory_used) AS calls_with_memory,
                       SUM(estimated_original_tokens) AS original_tokens,
                       SUM(estimated_sent_tokens) AS sent_tokens,
                       SUM(estimated_tokens_saved) AS saved_tokens,
                       AVG(estimated_reduction_percent) AS average_reduction,
                       AVG(estimation_error_percent) AS average_estimation_error
                  FROM context_savings
                """
            ).fetchone()
            by_task = connection.execute(
                """
                SELECT task_type, COUNT(*) AS calls,
                       SUM(estimated_tokens_saved) AS saved_tokens
                  FROM context_savings GROUP BY task_type
                 ORDER BY saved_tokens DESC
                """
            ).fetchall()
            by_model = connection.execute(
                """
                SELECT model, tier, COUNT(*) AS calls,
                       SUM(estimated_tokens_saved) AS saved_tokens
                  FROM context_savings GROUP BY model, tier
                 ORDER BY saved_tokens DESC
                """
            ).fetchall()
            by_file = connection.execute(
                """
                SELECT related_file, COUNT(DISTINCT call_id) AS calls,
                       ROUND(SUM(allocated_tokens_saved), 2) AS saved_tokens
                  FROM context_savings_files GROUP BY related_file
                 ORDER BY saved_tokens DESC
                """
            ).fetchall()

        calls = int(totals["calls_analyzed"] or 0)
        original = int(totals["original_tokens"] or 0)
        sent = int(totals["sent_tokens"] or 0)
        saved = int(totals["saved_tokens"] or 0)
        overall_reduction = round(saved / original * 100.0, 2) if original else 0.0
        result = {
            "title": "JOÃO CODE — ECONOMIA DE CONTEXTO",
            "calls_analyzed": calls,
            "calls_with_memory": int(totals["calls_with_memory"] or 0),
            "calls_without_memory": calls - int(totals["calls_with_memory"] or 0),
            "estimated_original_tokens": original,
            "estimated_sent_tokens": sent,
            "estimated_tokens_saved": saved,
            "estimated_overall_reduction_percent": overall_reduction,
            "estimated_average_reduction_percent": round(
                float(totals["average_reduction"] or 0.0), 2
            ),
            "average_estimation_error_percent": (
                round(float(totals["average_estimation_error"]), 2)
                if totals["average_estimation_error"] is not None
                else None
            ),
            "by_file": [dict(row) for row in by_file],
            "by_task": [dict(row) for row in by_task],
            "by_model_tier": [dict(row) for row in by_model],
            "estimation_notice": (
                "Valores estimados localmente; input_tokens do provedor e usado "
                "para medir o erro quando estiver disponivel."
            ),
        }
        result["summary"] = (
            "JOÃO CODE — ECONOMIA DE CONTEXTO\n\n"
            f"Chamadas analisadas: {calls}\n"
            f"Com memoria: {result['calls_with_memory']}\n\n"
            f"Contexto bruto estimado: {original} tokens\n"
            f"Contexto efetivamente enviado: {sent} tokens\n"
            f"Tokens estimados evitados: {saved}\n"
            f"Reducao estimada: {overall_reduction:.2f}%"
        )
        return result


def get_savings_report(db_path: str | Path) -> dict[str, Any]:
    return SavingsTracker(db_path).report()


def _count_text(value: Any) -> int:
    if isinstance(value, str):
        return len(value)
    if isinstance(value, Mapping):
        if isinstance(value.get("text"), str):
            return len(value["text"])
        if "content" in value:
            return _count_text(value["content"])
        return sum(_count_text(item) for item in value.values())
    if isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
        return sum(_count_text(item) for item in value)
    return 0


def _collect_text(value: Any, parts: list[str]) -> None:
    if isinstance(value, str):
        parts.append(value)
    elif isinstance(value, Mapping):
        if isinstance(value.get("text"), str):
            parts.append(value["text"])
            return
        if "content" in value:
            _collect_text(value["content"], parts)
            return
        for item in value.values():
            _collect_text(item, parts)
    elif isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
        for item in value:
            _collect_text(item, parts)


__all__ = [
    "ContextMetrics",
    "DEFAULT_CHARACTERS_PER_TOKEN",
    "ESTIMATION_METHOD",
    "SavingsTracker",
    "count_message_characters",
    "estimate_tokens",
    "get_savings_report",
    "measure_context_reduction",
    "message_text",
]
