"""Eventos locais que ligam os agentes Python ao escritório 3D.

Este módulo não chama nenhum modelo. Ele apenas registra repasses reais entre
agentes em JSONL para que o bridge local possa transmiti-los ao navegador.
"""

from __future__ import annotations

import json
import os
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


AGENT_IDS = frozenset({"pesquisador", "analista", "comercial", "executor", "supervisor"})
DEFAULT_EVENT_FILE = Path(__file__).resolve().parent / "storage" / "agent_office_events.jsonl"
MAX_TEXT_LENGTH = 180
MAX_TASK_LENGTH = 80
MAX_EVENT_FILE_BYTES = 2 * 1024 * 1024

_WRITE_LOCK = threading.Lock()
_SECRET_PATTERNS = (
    re.compile(r"(?i)\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{12,}\b"),
    re.compile(r"\bAIza[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/-]{12,}=*"),
)


def _enabled() -> bool:
    return os.getenv("AGENT_OFFICE_EVENTS_ENABLED", "1").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }


def _event_file(override: str | os.PathLike[str] | None = None) -> Path:
    configured = override or os.getenv("AGENT_OFFICE_EVENT_FILE")
    return Path(configured).expanduser().resolve() if configured else DEFAULT_EVENT_FILE


def _clean_text(value: Any, limit: int) -> str:
    text = " ".join(str(value or "").split())
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub("[CREDENCIAL REMOVIDA]", text)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _rotate_if_needed(path: Path) -> None:
    if not path.exists() or path.stat().st_size < MAX_EVENT_FILE_BYTES:
        return
    data = path.read_bytes()[-(MAX_EVENT_FILE_BYTES // 2) :]
    newline = data.find(b"\n")
    if newline >= 0:
        data = data[newline + 1 :]
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def _persist_event(
    event: dict[str, Any],
    event_file: str | os.PathLike[str] | None = None,
) -> dict[str, Any] | None:
    path = _event_file(event_file)
    try:
        with _WRITE_LOCK:
            path.parent.mkdir(parents=True, exist_ok=True)
            _rotate_if_needed(path)
            with path.open("a", encoding="utf-8", newline="\n") as stream:
                stream.write(json.dumps(event, ensure_ascii=False) + "\n")
    except OSError:
        return None
    return event


def publish_agent_handoff(
    from_agent: str,
    to_agent: str,
    text: Any,
    *,
    task: str | None = None,
    event_file: str | os.PathLike[str] | None = None,
) -> dict[str, Any] | None:
    """Persiste um repasse real entre dois agentes conhecidos.

    Falhas de observabilidade nunca interrompem o trabalho principal dos agentes.
    """

    if not _enabled():
        return None
    if from_agent not in AGENT_IDS or to_agent not in AGENT_IDS or from_agent == to_agent:
        raise ValueError("O repasse precisa usar dois agentes diferentes e conhecidos.")

    cleaned_text = _clean_text(text, MAX_TEXT_LENGTH)
    if not cleaned_text:
        cleaned_text = "Entrega concluída e encaminhada ao próximo agente."

    event = {
        "version": 1,
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": "agent_handoff",
        "from": from_agent,
        "to": to_agent,
        "text": cleaned_text,
        "task": _clean_text(task, MAX_TASK_LENGTH) if task else None,
        "source": "crewai",
    }

    return _persist_event(event, event_file)


def publish_office_status(
    status: str,
    text: Any,
    *,
    task: str | None = None,
    event_file: str | os.PathLike[str] | None = None,
) -> dict[str, Any] | None:
    """Publica o estado da execução iniciada pelo escritório 3D."""

    if not _enabled():
        return None
    if status not in {"running", "completed", "error"}:
        raise ValueError("Status do escritório inválido.")
    event = {
        "version": 1,
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": "office_status",
        "status": status,
        "text": _clean_text(text, MAX_TEXT_LENGTH),
        "task": _clean_text(task, MAX_TASK_LENGTH) if task else None,
        "source": "joao_code_runner",
    }
    return _persist_event(event, event_file)


def build_handoff_callback(
    from_agent: str,
    to_agent: str,
    task: str,
) -> Callable[[Any], None]:
    """Cria um callback CrewAI que publica a saída real sem nova chamada de IA."""

    def on_task_complete(task_output: Any) -> None:
        raw_output = getattr(task_output, "raw", task_output)
        publish_agent_handoff(from_agent, to_agent, raw_output, task=task)

    return on_task_complete

