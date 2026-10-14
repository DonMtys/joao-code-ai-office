"""Gateway central de modelos de IA baseado em LiteLLM.

Este modulo concentra selecao de modelo, controle de orcamento e telemetria
local. Ele nao grava prompts, respostas ou credenciais no log.
"""

from __future__ import annotations

import json
import inspect
import os
import sqlite3
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from code_memory import CodeMemory, remember_task_events
from context_metrics import (
    ContextMetrics,
    SavingsTracker,
    count_message_characters,
    get_savings_report as _get_savings_report,
    measure_context_reduction,
    message_text,
)

try:
    from crewai.llms.base_llm import BaseLLM
except (ImportError, ModuleNotFoundError):  # Permite testes com CrewAI simulado.
    BaseLLM = None  # type: ignore[assignment,misc]


class ModelTier(str, Enum):
    CHEAP = "CHEAP"
    MEDIUM = "MEDIUM"
    PREMIUM = "PREMIUM"
    LOCAL = "LOCAL"


@dataclass(frozen=True)
class GatewayConfig:
    cheap_model: str
    medium_model: str
    premium_model: str
    monthly_budget_brl: float
    usd_to_brl: float
    usage_log_path: Path
    cache_enabled: bool
    local_model: str = ""
    savings_db_path: Path = Path("storage/context_savings.sqlite3")
    savings_enabled: bool = False
    local_api_base: str = ""
    local_api_key: str = ""
    local_enabled: bool = True
    allow_paid_fallback: bool = False

    @classmethod
    def from_env(cls, fallback_model: str | None = None) -> "GatewayConfig":
        _load_project_env()
        legacy_model = (
            fallback_model
            or os.getenv("GEMINI_MODEL_NAME", "").strip()
            or "gemini/gemini-3.5-flash-lite"
        )
        cheap = os.getenv("AI_CHEAP_MODEL", "").strip() or legacy_model
        medium = os.getenv("AI_MEDIUM_MODEL", "").strip() or cheap
        premium = os.getenv("AI_PREMIUM_MODEL", "").strip() or medium
        local = os.getenv("AI_LOCAL_MODEL", "").strip()
        return cls(
            cheap_model=cheap,
            medium_model=medium,
            premium_model=premium,
            monthly_budget_brl=_env_float("AI_MONTHLY_BUDGET_BRL", 100.0),
            usd_to_brl=_env_float("AI_USD_TO_BRL", 5.0),
            usage_log_path=Path(
                os.getenv("AI_USAGE_LOG_PATH", "storage/ai_usage.jsonl")
            ),
            cache_enabled=_env_bool("AI_CACHE_ENABLED", False),
            local_model=local,
            savings_db_path=Path(
                os.getenv("AI_SAVINGS_DB_PATH", "storage/context_savings.sqlite3")
            ),
            savings_enabled=_env_bool("AI_SAVINGS_ENABLED", True),
            local_api_base=os.getenv("AI_LOCAL_API_BASE", "").strip(),
            local_api_key=os.getenv("AI_LOCAL_API_KEY", "").strip(),
            local_enabled=_env_bool("AI_LOCAL_ENABLED", True),
            allow_paid_fallback=_env_bool("AI_ALLOW_PAID_FALLBACK", False),
        )


@dataclass(frozen=True)
class RouteDecision:
    model: str
    tier: ModelTier
    budget_downgraded: bool = False


class MonthlyBudgetExceededError(RuntimeError):
    """A chamada paga foi bloqueada porque o limite mensal foi atingido."""


class LocalModelError(RuntimeError):
    """Erro controlado de uma rota exclusivamente local."""


class LocalModelUnavailableError(LocalModelError):
    """A rota local esta desabilitada ou sem configuracao suficiente."""


class LocalModelConnectionError(LocalModelError):
    """O endpoint local nao concluiu a chamada solicitada."""


_LOG_LOCK = threading.Lock()

_PROVIDER_KEY_ENV = {
    "anthropic": ("ANTHROPIC_API_KEY",),
    "deepseek": ("DEEPSEEK_API_KEY",),
    "gemini": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
    "google": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
    "openai": ("OPENAI_API_KEY",),
    "qwen": ("DASHSCOPE_API_KEY", "QWEN_API_KEY"),
}

_PREMIUM_TASKS = {
    "critical",
    "critical_decision",
    "complex_reasoning",
    "executive_review",
    "final_review",
    "premium",
    "supervision",
}
_MEDIUM_TASKS = {
    "analysis",
    "analyst",
    "code",
    "coding",
    "commercial",
    "planning",
    "sales",
    "strategy",
}


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on", "sim"}


def _load_project_env() -> None:
    """Carrega o .env do projeto sem sobrescrever variaveis do processo."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(Path(__file__).with_name(".env"), override=False)


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name, "").strip()
    if not value:
        return default
    try:
        return float(value.replace(",", "."))
    except ValueError:
        return default


def tier_for_task(task_type: str | None) -> ModelTier:
    normalized = (task_type or "general").strip().lower().replace("-", "_")
    if normalized in _PREMIUM_TASKS:
        return ModelTier.PREMIUM
    if normalized in _MEDIUM_TASKS:
        return ModelTier.MEDIUM
    return ModelTier.CHEAP


def _model_for_tier(config: GatewayConfig, tier: ModelTier) -> str:
    return {
        ModelTier.CHEAP: config.cheap_model,
        ModelTier.MEDIUM: config.medium_model,
        ModelTier.PREMIUM: config.premium_model,
        ModelTier.LOCAL: config.local_model,
    }[tier]


def _coerce_tier(tier: str | ModelTier | None, task_type: str | None) -> ModelTier:
    if tier is None:
        return tier_for_task(task_type)
    if isinstance(tier, ModelTier):
        return tier
    try:
        return ModelTier(str(tier).strip().upper())
    except ValueError as exc:
        valid = ", ".join(item.value.lower() for item in ModelTier)
        raise ValueError(f"tier invalido: {tier!r}. Use: {valid}.") from exc


def monthly_spend_brl(
    config: GatewayConfig | None = None,
    *,
    now: datetime | None = None,
) -> float:
    cfg = config or GatewayConfig.from_env()
    moment = now or datetime.now(timezone.utc)
    month_prefix = moment.strftime("%Y-%m")
    if not cfg.usage_log_path.exists():
        return 0.0

    total = 0.0
    try:
        with cfg.usage_log_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                try:
                    item = json.loads(line)
                except (json.JSONDecodeError, TypeError):
                    continue
                if str(item.get("timestamp", "")).startswith(month_prefix):
                    total += float(item.get("estimated_cost_brl") or 0.0)
    except OSError:
        return 0.0
    return round(total, 8)


def resolve_model(
    *,
    task_type: str | None = None,
    tier: str | ModelTier | None = None,
    preferred_model: str | None = None,
    fallback_model: str | None = None,
    config: GatewayConfig | None = None,
) -> RouteDecision:
    cfg = config or GatewayConfig.from_env(fallback_model=fallback_model)
    selected_tier = _coerce_tier(tier, task_type)

    # preferred_model e uma escolha explicita do chamador e preserva o fluxo
    # legado de subsistemas que dependem de um endpoint especifico.
    if preferred_model and preferred_model.strip():
        model = preferred_model.strip()
        if cfg.local_model and model == cfg.local_model:
            selected_tier = ModelTier.LOCAL
        return RouteDecision(model=model, tier=selected_tier)

    model = _model_for_tier(cfg, selected_tier)
    if selected_tier is ModelTier.LOCAL and not model:
        raise ValueError(
            "AI_LOCAL_MODEL nao configurado. Defina o modelo local no .env."
        )
    return RouteDecision(model=model, tier=selected_tier)


def get_budget_status(config: GatewayConfig | None = None) -> dict[str, Any]:
    """Retorna consumo mensal e uma representacao pronta para exibicao."""
    cfg = config or GatewayConfig.from_env()
    spent = monthly_spend_brl(cfg)
    limit = max(0.0, cfg.monthly_budget_brl)
    remaining = max(0.0, limit - spent)
    usage_percent = 100.0 if limit == 0 else min(100.0, spent / limit * 100.0)
    exhausted = spent >= limit
    summary = "\n".join(
        (
            f"Gasto no mes: {_format_brl(spent)}",
            f"Limite: {_format_brl(limit)}",
            f"Restante: {_format_brl(remaining)}",
            f"Uso: {_format_percent(usage_percent)}",
        )
    )
    return {
        "spent_brl": round(spent, 2),
        "limit_brl": round(limit, 2),
        "remaining_brl": round(remaining, 2),
        "usage_percent": round(usage_percent, 2),
        "is_exhausted": exhausted,
        "summary": summary,
    }


def _format_brl(value: float) -> str:
    formatted = f"{value:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"R$ {formatted}"


def _format_percent(value: float) -> str:
    formatted = f"{value:.1f}".replace(".", ",")
    return f"{formatted}%"


def _is_local_route(decision: RouteDecision, config: GatewayConfig) -> bool:
    return decision.tier is ModelTier.LOCAL or bool(
        config.local_model and decision.model == config.local_model
    )


def _configure_local_request(
    request: dict[str, Any],
    config: GatewayConfig,
    *,
    api_key: str | None,
    api_base: str | None,
    require_endpoint: bool,
) -> None:
    if not config.local_enabled:
        raise LocalModelUnavailableError(
            "Modelo local desabilitado. Defina AI_LOCAL_ENABLED=true."
        )
    endpoint = (api_base or config.local_api_base).strip()
    if require_endpoint and not endpoint:
        raise LocalModelUnavailableError(
            "AI_LOCAL_API_BASE nao configurado para a chamada local."
        )
    forbidden_fallbacks = (
        "fallbacks",
        "context_window_fallbacks",
        "content_policy_fallbacks",
    )
    if not config.allow_paid_fallback and any(
        request.get(name) for name in forbidden_fallbacks
    ):
        raise LocalModelError(
            "Fallback automatico bloqueado por AI_ALLOW_PAID_FALLBACK=false."
        )
    if endpoint:
        request["api_base"] = endpoint
    local_key = api_key if api_key is not None else config.local_api_key
    if local_key:
        request["api_key"] = local_key


def _block_if_budget_exhausted(
    config: GatewayConfig,
    decision: RouteDecision,
    *,
    task_type: str,
    timestamp: str,
    log_metadata: Mapping[str, Any] | None = None,
) -> None:
    if _is_local_route(decision, config):
        return
    status = get_budget_status(config)
    if not status["is_exhausted"]:
        return
    _write_usage_log(
        config,
        {
            "timestamp": timestamp,
            "task_type": task_type,
            "tier": decision.tier.value,
            "model": decision.model,
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "estimated_cost_usd": 0.0,
            "estimated_cost_brl": 0.0,
            "success": False,
            "blocked_by_budget": True,
            **dict(log_metadata or {}),
        },
    )
    raise MonthlyBudgetExceededError(
        "Limite mensal de IA atingido. Chamadas pagas foram bloqueadas; "
        "configure AI_LOCAL_MODEL para continuar com custo zero."
    )


def credentials_available(
    model: str,
    *,
    api_key: str | None = None,
    credential_model: str | None = None,
) -> bool:
    if api_key and _same_provider(model, credential_model):
        return True
    names = _PROVIDER_KEY_ENV.get(_provider(model), ())
    return any(os.getenv(name, "").strip() for name in names)


def call_ai(
    messages: str | Sequence[Mapping[str, Any]],
    task_type: str = "general",
    tier: str | ModelTier | None = None,
    preferred_model: str | None = None,
    *,
    fallback_model: str | None = None,
    config: GatewayConfig | None = None,
    completion_fn: Callable[..., Any] | None = None,
    cost_fn: Callable[..., float] | None = None,
    api_key: str | None = None,
    credential_model: str | None = None,
    api_base: str | None = None,
    use_memory: bool = False,
    memory_query: str | None = None,
    memory_files: Sequence[str | Path] | None = None,
    memory_symbols: Sequence[str] | None = None,
    memory_limit: int | None = None,
    memory_max_context_chars: int | None = None,
    memory_max_age_days: int | None = None,
    memory_min_confidence: float | None = None,
    memory_store: CodeMemory | None = None,
    memory_events: Sequence[Mapping[str, Any]] | None = None,
    **kwargs: Any,
) -> Any:
    """Executa uma chamada pelo LiteLLM e registra somente metadados locais."""
    cfg = config or GatewayConfig.from_env(fallback_model=fallback_model)
    decision = resolve_model(
        task_type=task_type,
        tier=tier,
        preferred_model=preferred_model,
        fallback_model=fallback_model,
        config=cfg,
    )
    normalized_messages = _normalize_messages(messages)
    normalized_messages, memory_log = _prepare_memory_for_call(
        normalized_messages,
        use_memory=use_memory,
        memory_query=memory_query or task_type,
        memory_files=memory_files,
        memory_symbols=memory_symbols,
        memory_limit=memory_limit,
        memory_max_context_chars=memory_max_context_chars,
        memory_max_age_days=memory_max_age_days,
        memory_min_confidence=memory_min_confidence,
        memory_store=memory_store,
    )

    using_default_completion = completion_fn is None
    if completion_fn is None:
        from litellm import completion as litellm_completion

        completion_fn = litellm_completion

    request: dict[str, Any] = {
        "model": decision.model,
        "messages": normalized_messages,
        **{key: value for key, value in kwargs.items() if value is not None},
    }
    if cfg.cache_enabled:
        request.setdefault("caching", True)
    if _is_local_route(decision, cfg):
        _configure_local_request(
            request,
            cfg,
            api_key=api_key,
            api_base=api_base,
            require_endpoint=using_default_completion,
        )
    elif api_key and _same_provider(decision.model, credential_model):
        request["api_key"] = api_key
        if api_base:
            request["api_base"] = api_base

    timestamp = datetime.now(timezone.utc).isoformat()
    _block_if_budget_exhausted(
        cfg,
        decision,
        task_type=task_type,
        timestamp=timestamp,
        log_metadata=memory_log,
    )
    call_started = time.perf_counter()
    try:
        response = completion_fn(**request)
        latency_ms = round((time.perf_counter() - call_started) * 1000.0, 3)
        usage = extract_usage(response)
        cost_usd = (
            0.0 if _is_local_route(decision, cfg) else _estimate_cost(response, cost_fn)
        )
        savings_log = _record_savings(
            cfg,
            decision,
            task_type=task_type,
            timestamp=timestamp,
            memory_log=memory_log,
            provider_input_tokens=usage["prompt_tokens"],
        )
        event_log = _save_task_events(memory_events, memory_store)
        _write_usage_log(
            cfg,
            {
                "timestamp": timestamp,
                "task_type": task_type,
                "tier": decision.tier.value,
                "model": decision.model,
                "input_tokens": usage["prompt_tokens"],
                "output_tokens": usage["completion_tokens"],
                "total_tokens": usage["total_tokens"],
                "estimated_cost_usd": round(cost_usd, 10),
                "estimated_cost_brl": round(cost_usd * cfg.usd_to_brl, 8),
                "budget_downgraded": decision.budget_downgraded,
                "cache_enabled": cfg.cache_enabled,
                "local_model": _is_local_route(decision, cfg),
                "latency_ms": latency_ms,
                "success": True,
                **memory_log,
                **savings_log,
                **event_log,
            },
        )
        return response
    except Exception as exc:
        latency_ms = round((time.perf_counter() - call_started) * 1000.0, 3)
        logged_error = (
            LocalModelConnectionError(
                f"Falha controlada no modelo local ({type(exc).__name__})."
            )
            if _is_local_route(decision, cfg) and not isinstance(exc, LocalModelError)
            else exc
        )
        _write_usage_log(
            cfg,
            {
                "timestamp": timestamp,
                "task_type": task_type,
                "tier": decision.tier.value,
                "model": decision.model,
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "estimated_cost_usd": 0.0,
                "estimated_cost_brl": 0.0,
                "budget_downgraded": decision.budget_downgraded,
                "cache_enabled": cfg.cache_enabled,
                "success": False,
                "error_type": type(logged_error).__name__,
                "latency_ms": latency_ms,
                **memory_log,
            },
        )
        if logged_error is not exc:
            raise logged_error from exc
        raise


async def acall_ai(
    messages: str | Sequence[Mapping[str, Any]],
    task_type: str = "general",
    tier: str | ModelTier | None = None,
    preferred_model: str | None = None,
    *,
    fallback_model: str | None = None,
    config: GatewayConfig | None = None,
    completion_fn: Callable[..., Any] | None = None,
    cost_fn: Callable[..., float] | None = None,
    api_key: str | None = None,
    credential_model: str | None = None,
    api_base: str | None = None,
    use_memory: bool = False,
    memory_query: str | None = None,
    memory_files: Sequence[str | Path] | None = None,
    memory_symbols: Sequence[str] | None = None,
    memory_limit: int | None = None,
    memory_max_context_chars: int | None = None,
    memory_max_age_days: int | None = None,
    memory_min_confidence: float | None = None,
    memory_store: CodeMemory | None = None,
    memory_events: Sequence[Mapping[str, Any]] | None = None,
    **kwargs: Any,
) -> Any:
    """Versao assincrona do gateway para Browser Use e outros clientes async."""
    cfg = config or GatewayConfig.from_env(fallback_model=fallback_model)
    decision = resolve_model(
        task_type=task_type,
        tier=tier,
        preferred_model=preferred_model,
        fallback_model=fallback_model,
        config=cfg,
    )
    normalized_messages = _normalize_messages(messages)
    normalized_messages, memory_log = _prepare_memory_for_call(
        normalized_messages,
        use_memory=use_memory,
        memory_query=memory_query or task_type,
        memory_files=memory_files,
        memory_symbols=memory_symbols,
        memory_limit=memory_limit,
        memory_max_context_chars=memory_max_context_chars,
        memory_max_age_days=memory_max_age_days,
        memory_min_confidence=memory_min_confidence,
        memory_store=memory_store,
    )
    using_default_completion = completion_fn is None
    if completion_fn is None:
        from litellm import acompletion as litellm_acompletion

        completion_fn = litellm_acompletion

    request: dict[str, Any] = {
        "model": decision.model,
        "messages": normalized_messages,
        **{key: value for key, value in kwargs.items() if value is not None},
    }
    if cfg.cache_enabled:
        request.setdefault("caching", True)
    if _is_local_route(decision, cfg):
        _configure_local_request(
            request,
            cfg,
            api_key=api_key,
            api_base=api_base,
            require_endpoint=using_default_completion,
        )
    elif api_key and _same_provider(decision.model, credential_model):
        request["api_key"] = api_key
        if api_base:
            request["api_base"] = api_base

    timestamp = datetime.now(timezone.utc).isoformat()
    _block_if_budget_exhausted(
        cfg,
        decision,
        task_type=task_type,
        timestamp=timestamp,
        log_metadata=memory_log,
    )
    call_started = time.perf_counter()
    try:
        pending = completion_fn(**request)
        response = await pending if inspect.isawaitable(pending) else pending
        latency_ms = round((time.perf_counter() - call_started) * 1000.0, 3)
        usage = extract_usage(response)
        cost_usd = (
            0.0 if _is_local_route(decision, cfg) else _estimate_cost(response, cost_fn)
        )
        savings_log = _record_savings(
            cfg,
            decision,
            task_type=task_type,
            timestamp=timestamp,
            memory_log=memory_log,
            provider_input_tokens=usage["prompt_tokens"],
        )
        event_log = _save_task_events(memory_events, memory_store)
        _write_usage_log(
            cfg,
            {
                "timestamp": timestamp,
                "task_type": task_type,
                "tier": decision.tier.value,
                "model": decision.model,
                "input_tokens": usage["prompt_tokens"],
                "output_tokens": usage["completion_tokens"],
                "total_tokens": usage["total_tokens"],
                "estimated_cost_usd": round(cost_usd, 10),
                "estimated_cost_brl": round(cost_usd * cfg.usd_to_brl, 8),
                "budget_downgraded": decision.budget_downgraded,
                "cache_enabled": cfg.cache_enabled,
                "local_model": _is_local_route(decision, cfg),
                "latency_ms": latency_ms,
                "success": True,
                **memory_log,
                **savings_log,
                **event_log,
            },
        )
        return response
    except Exception as exc:
        latency_ms = round((time.perf_counter() - call_started) * 1000.0, 3)
        logged_error = (
            LocalModelConnectionError(
                f"Falha controlada no modelo local ({type(exc).__name__})."
            )
            if _is_local_route(decision, cfg) and not isinstance(exc, LocalModelError)
            else exc
        )
        _write_usage_log(
            cfg,
            {
                "timestamp": timestamp,
                "task_type": task_type,
                "tier": decision.tier.value,
                "model": decision.model,
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "estimated_cost_usd": 0.0,
                "estimated_cost_brl": 0.0,
                "budget_downgraded": decision.budget_downgraded,
                "cache_enabled": cfg.cache_enabled,
                "success": False,
                "error_type": type(logged_error).__name__,
                "latency_ms": latency_ms,
                **memory_log,
            },
        )
        if logged_error is not exc:
            raise logged_error from exc
        raise


def extract_usage(response: Any) -> dict[str, int]:
    usage = _value(response, "usage") or {}
    prompt = _int_value(usage, "prompt_tokens", "input_tokens")
    completion = _int_value(usage, "completion_tokens", "output_tokens")
    total = _int_value(usage, "total_tokens") or prompt + completion
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": total,
    }


def response_text(response: Any) -> str:
    choices = _value(response, "choices") or []
    if not choices:
        return str(response)
    message = _value(choices[0], "message") or {}
    content = _value(message, "content")
    return "" if content is None else str(content)


def _prepare_memory_for_call(
    messages: list[dict[str, Any]],
    *,
    use_memory: bool,
    memory_query: str,
    memory_files: Sequence[str | Path] | None,
    memory_symbols: Sequence[str] | None,
    memory_limit: int | None,
    memory_max_context_chars: int | None,
    memory_max_age_days: int | None,
    memory_min_confidence: float | None,
    memory_store: CodeMemory | None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    base_chars = count_message_characters(messages)
    if not use_memory:
        metrics = measure_context_reduction(base_chars, base_chars)
        return messages, _memory_log_fields(False, 0, 0, metrics)

    try:
        store = memory_store or CodeMemory()
        prepared = store.build_task_context(
            memory_query,
            files=memory_files,
            symbols=memory_symbols,
            limit=memory_limit,
            max_context_chars=memory_max_context_chars,
            max_age_days=memory_max_age_days,
            min_confidence=memory_min_confidence,
            existing_text=message_text(messages),
        )
    except (OSError, ValueError, sqlite3.Error):
        metrics = measure_context_reduction(base_chars, base_chars)
        log_fields = _memory_log_fields(False, 0, 0, metrics)
        log_fields["memory_error"] = True
        return messages, log_fields

    context = str(prepared.get("context") or "")
    if context:
        memory_message = {
            "role": "system",
            "content": (
                "Contexto local recuperado da memoria do projeto. "
                "Use somente quando for relevante e priorize a tarefa atual.\n\n"
                + context
            ),
        }
        sent_messages = [memory_message, *messages]
    else:
        sent_messages = messages

    original_chars = base_chars + int(prepared.get("original_memory_chars") or 0)
    sent_chars = count_message_characters(sent_messages)
    metrics = measure_context_reduction(original_chars, sent_chars)
    return sent_messages, _memory_log_fields(
        bool(context),
        int(prepared.get("memory_results") or 0),
        int(prepared.get("memory_context_chars") or 0),
        metrics,
        related_files=[
            str(item.get("related_file"))
            for item in prepared.get("memories", [])
            if item.get("related_file")
        ],
    )


def _memory_log_fields(
    memory_used: bool,
    memory_results: int,
    memory_context_chars: int,
    metrics: Any,
    related_files: Sequence[str] | None = None,
) -> dict[str, Any]:
    return {
        "memory_used": memory_used,
        "memory_results": memory_results,
        "memory_context_chars": memory_context_chars,
        "estimated_context_tokens": metrics.estimated_sent_tokens,
        "estimated_tokens_saved": metrics.estimated_tokens_saved,
        "estimated_reduction_percent": metrics.estimated_reduction_percent,
        "context_estimation_method": metrics.estimation_method,
        "estimated_original_context_tokens": metrics.estimated_original_tokens,
        "context_original_chars": metrics.original_chars,
        "context_sent_chars": metrics.sent_chars,
        "memory_related_files": list(dict.fromkeys(related_files or ())),
    }


def _record_savings(
    config: GatewayConfig,
    decision: RouteDecision,
    *,
    task_type: str,
    timestamp: str,
    memory_log: Mapping[str, Any],
    provider_input_tokens: int,
) -> dict[str, Any]:
    if not config.savings_enabled:
        return {}
    metrics = ContextMetrics(
        original_chars=int(memory_log.get("context_original_chars") or 0),
        sent_chars=int(memory_log.get("context_sent_chars") or 0),
        estimated_original_tokens=int(
            memory_log.get("estimated_original_context_tokens") or 0
        ),
        estimated_sent_tokens=int(memory_log.get("estimated_context_tokens") or 0),
        estimated_tokens_saved=int(memory_log.get("estimated_tokens_saved") or 0),
        estimated_reduction_percent=float(
            memory_log.get("estimated_reduction_percent") or 0.0
        ),
        estimation_method=str(
            memory_log.get("context_estimation_method")
            or "estimated_chars_divided_by_4"
        ),
    )
    try:
        result = SavingsTracker(config.savings_db_path).record(
            metrics,
            timestamp=timestamp,
            task_type=task_type,
            tier=decision.tier.value,
            model=decision.model,
            memory_used=bool(memory_log.get("memory_used")),
            provider_input_tokens=provider_input_tokens or None,
            related_files=memory_log.get("memory_related_files") or (),
        )
        return {
            "provider_input_tokens": result["provider_input_tokens"],
            "estimated_token_error_percent": result["estimation_error_percent"],
        }
    except (OSError, sqlite3.Error, ValueError):
        return {"savings_persistence_error": True}


def _save_task_events(
    events: Sequence[Mapping[str, Any]] | None,
    memory_store: CodeMemory | None,
) -> dict[str, Any]:
    if not events:
        return {"agent_memory_events_saved": 0}
    try:
        saved = remember_task_events(
            events,
            memory=memory_store or CodeMemory(),
        )
        return {"agent_memory_events_saved": len(saved)}
    except (OSError, sqlite3.Error, ValueError):
        return {
            "agent_memory_events_saved": 0,
            "agent_memory_event_error": True,
        }


def get_savings_report(config: GatewayConfig | None = None) -> dict[str, Any]:
    cfg = config or GatewayConfig.from_env()
    return _get_savings_report(cfg.savings_db_path)


def check_local_model(
    config: GatewayConfig | None = None,
    *,
    timeout_seconds: float = 2.0,
    urlopen_fn: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    """Consulta somente ``/models`` do endpoint local OpenAI-compatible."""
    cfg = config or GatewayConfig.from_env()
    backend = _local_backend_name(cfg.local_api_base)
    result: dict[str, Any] = {
        "enabled": cfg.local_enabled,
        "endpoint_available": False,
        "model_available": False,
        "model": cfg.local_model,
        "backend": backend,
        "api_base": cfg.local_api_base,
        "latency_ms": None,
        "models": [],
        "error_type": None,
    }
    if not cfg.local_enabled:
        result["error_type"] = "LocalModelDisabled"
        return result
    if not cfg.local_api_base:
        result["error_type"] = "LocalApiBaseMissing"
        return result

    request = urllib.request.Request(
        cfg.local_api_base.rstrip("/") + "/models",
        method="GET",
        headers=(
            {"Authorization": f"Bearer {cfg.local_api_key}"}
            if cfg.local_api_key
            else {}
        ),
    )
    opener = urlopen_fn or urllib.request.urlopen
    started = time.perf_counter()
    try:
        with opener(request, timeout=max(0.1, timeout_seconds)) as response:
            payload = json.loads(response.read(1024 * 1024).decode("utf-8"))
        latency_ms = round((time.perf_counter() - started) * 1000.0, 3)
        models = [
            str(item.get("id"))
            for item in payload.get("data", [])
            if isinstance(item, Mapping) and item.get("id")
        ]
        configured_names = {cfg.local_model}
        if "/" in cfg.local_model:
            configured_names.add(cfg.local_model.split("/", 1)[1])
        result.update(
            {
                "endpoint_available": True,
                "model_available": bool(configured_names & set(models)),
                "latency_ms": latency_ms,
                "models": models,
            }
        )
        return result
    except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as exc:
        result["latency_ms"] = round((time.perf_counter() - started) * 1000.0, 3)
        result["error_type"] = type(exc).__name__
        return result


def discover_local_backends(
    *,
    timeout_seconds: float = 0.5,
) -> list[dict[str, Any]]:
    """Sonda apenas endpoints loopback conhecidos, sem baixar modelos."""
    cfg = GatewayConfig.from_env()
    endpoints = [
        cfg.local_api_base,
        "http://127.0.0.1:11434/v1",
        "http://127.0.0.1:1234/v1",
        "http://127.0.0.1:8000/v1",
    ]
    results: list[dict[str, Any]] = []
    for endpoint in dict.fromkeys(item for item in endpoints if item):
        probe = replace(
            cfg,
            local_api_base=endpoint,
            local_enabled=True,
        )
        status = check_local_model(probe, timeout_seconds=timeout_seconds)
        if status["endpoint_available"]:
            results.append(status)
    return results


def get_local_model_report(
    config: GatewayConfig | None = None,
    *,
    health_status: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    cfg = config or GatewayConfig.from_env()
    records = [
        record
        for record in _iter_usage_records(cfg.usage_log_path)
        if record.get("local_model")
    ]
    successful = [record for record in records if record.get("success")]
    latencies = [
        float(record["latency_ms"])
        for record in successful
        if record.get("latency_ms") is not None
    ]
    status = dict(health_status or {})
    report = {
        "title": "JOÃO CODE — MODELO LOCAL",
        "model": cfg.local_model,
        "backend": status.get("backend") or _local_backend_name(cfg.local_api_base),
        "available": bool(status.get("endpoint_available")),
        "model_available": bool(status.get("model_available")),
        "calls": len(successful),
        "input_tokens": sum(int(item.get("input_tokens") or 0) for item in successful),
        "output_tokens": sum(int(item.get("output_tokens") or 0) for item in successful),
        "cost_brl": 0.0,
        "memory_calls": sum(bool(item.get("memory_used")) for item in successful),
        "estimated_tokens_saved": sum(
            int(item.get("estimated_tokens_saved") or 0) for item in successful
        ),
        "average_latency_ms": (
            round(sum(latencies) / len(latencies), 3) if latencies else None
        ),
        "paid_fallback_allowed": cfg.allow_paid_fallback,
    }
    report["summary"] = (
        "JOÃO CODE — MODELO LOCAL\n\n"
        f"Modelo: {report['model']}\n"
        f"Backend: {report['backend']}\n"
        f"Disponivel: {report['available']}\n\n"
        f"Chamadas: {report['calls']}\n"
        f"Tokens entrada: {report['input_tokens']}\n"
        f"Tokens saida: {report['output_tokens']}\n"
        "Custo monetario: R$ 0,00\n\n"
        f"Memoria utilizada: {report['memory_calls']} chamada(s)\n"
        f"Tokens estimados evitados: {report['estimated_tokens_saved']}\n"
        f"Latencia media: {report['average_latency_ms']} ms"
    )
    return report


def _local_backend_name(api_base: str) -> str:
    lowered = api_base.lower()
    if "11434" in lowered:
        return "Ollama (OpenAI-compatible)"
    if "1234" in lowered:
        return "LM Studio (OpenAI-compatible)"
    if "8000" in lowered:
        return "vLLM/OpenAI-compatible"
    return "OpenAI-compatible local"


def _iter_usage_records(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records: list[dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                try:
                    item = json.loads(line)
                except (json.JSONDecodeError, TypeError):
                    continue
                if isinstance(item, dict):
                    records.append(item)
    except OSError:
        return []
    return records


def _normalize_messages(
    messages: str | Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    if isinstance(messages, str):
        return [{"role": "user", "content": messages}]
    return [dict(message) for message in messages]


def _estimate_cost(response: Any, cost_fn: Callable[..., float] | None) -> float:
    hidden = _value(response, "_hidden_params") or {}
    known_cost = _value(hidden, "response_cost")
    if known_cost is not None:
        try:
            return max(0.0, float(known_cost))
        except (TypeError, ValueError):
            pass
    try:
        if cost_fn is None:
            from litellm import completion_cost

            cost_fn = completion_cost
        return max(0.0, float(cost_fn(completion_response=response)))
    except Exception:
        return 0.0


def _write_usage_log(config: GatewayConfig, record: Mapping[str, Any]) -> None:
    try:
        with _LOG_LOCK:
            config.usage_log_path.parent.mkdir(parents=True, exist_ok=True)
            with config.usage_log_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(dict(record), ensure_ascii=False) + "\n")
    except OSError:
        # Falha de telemetria local nao deve derrubar uma chamada de producao.
        return


def _provider(model: str | None) -> str:
    value = (model or "").strip().lower()
    return value.partition("/")[0] if "/" in value else "openai"


def _same_provider(model: str, credential_model: str | None) -> bool:
    return credential_model is None or _provider(model) == _provider(credential_model)


def _value(obj: Any, key: str) -> Any:
    if isinstance(obj, Mapping):
        return obj.get(key)
    return getattr(obj, key, None)


def _int_value(obj: Any, *keys: str) -> int:
    for key in keys:
        value = _value(obj, key)
        if value is not None:
            try:
                return int(value)
            except (TypeError, ValueError):
                continue
    return 0


class LiteLLMBrowserUseLLM:
    """Adaptador estrutural para o protocolo ``browser_use.llm.BaseChatModel``."""

    _verified_api_keys = True
    model: str

    @classmethod
    def __get_pydantic_core_schema__(cls, source_type: Any, handler: Any) -> Any:
        del cls, source_type, handler
        from pydantic_core import core_schema

        return core_schema.any_schema()

    def __init__(
        self,
        *,
        task_type: str = "browser_navigation",
        preferred_model: str | None = None,
        fallback_model: str | None = None,
        api_key: str | None = None,
        credential_model: str | None = None,
        api_base: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> None:
        decision = resolve_model(
            task_type=task_type,
            preferred_model=preferred_model,
            fallback_model=fallback_model,
        )
        self.model = decision.model
        self.task_type = task_type
        self.preferred_model = preferred_model
        self.fallback_model = fallback_model
        self.api_key = api_key
        self.credential_model = credential_model or preferred_model or fallback_model
        self.api_base = api_base
        self.temperature = temperature
        self.max_tokens = max_tokens

    @property
    def provider(self) -> str:
        return _provider(self.model)

    @property
    def name(self) -> str:
        return self.model

    @property
    def model_name(self) -> str:
        return self.model

    async def ainvoke(
        self,
        messages: Sequence[Any],
        output_format: type[Any] | None = None,
        **kwargs: Any,
    ) -> Any:
        from browser_use.llm.views import ChatInvokeCompletion, ChatInvokeUsage

        normalized: list[dict[str, Any]] = []
        for message in messages:
            if isinstance(message, Mapping):
                item = dict(message)
            else:
                item = message.model_dump(exclude_none=True)
            item.pop("cache", None)
            normalized.append(item)

        if output_format is not None:
            kwargs.setdefault("response_format", output_format)
        response = await acall_ai(
            normalized,
            task_type=self.task_type,
            preferred_model=self.preferred_model,
            fallback_model=self.fallback_model,
            api_key=self.api_key,
            credential_model=self.credential_model,
            api_base=self.api_base,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            **kwargs,
        )
        usage = extract_usage(response)
        choices = _value(response, "choices") or []
        choice = choices[0] if choices else {}
        message = _value(choice, "message") or {}
        parsed = _value(message, "parsed")
        text = response_text(response)
        if output_format is None:
            completion: Any = text
        elif isinstance(parsed, output_format):
            completion = parsed
        elif parsed is not None:
            completion = output_format.model_validate(parsed)
        else:
            completion = output_format.model_validate_json(text)

        return ChatInvokeCompletion(
            completion=completion,
            usage=ChatInvokeUsage(
                prompt_tokens=usage["prompt_tokens"],
                prompt_cached_tokens=None,
                prompt_cache_creation_tokens=None,
                prompt_image_tokens=None,
                completion_tokens=usage["completion_tokens"],
                total_tokens=usage["total_tokens"],
            ),
            stop_reason=_value(choice, "finish_reason"),
        )


def build_browser_use_llm(
    *,
    task_type: str = "browser_navigation",
    preferred_model: str | None = None,
    fallback_model: str | None = None,
    api_key: str | None = None,
    credential_model: str | None = None,
    api_base: str | None = None,
    **kwargs: Any,
) -> LiteLLMBrowserUseLLM:
    return LiteLLMBrowserUseLLM(
        task_type=task_type,
        preferred_model=preferred_model,
        fallback_model=fallback_model,
        api_key=api_key,
        credential_model=credential_model,
        api_base=api_base,
        **kwargs,
    )


if BaseLLM is not None:

    class LiteLLMGatewayCrewAILLM(BaseLLM):  # type: ignore[misc,valid-type]
        """Adaptador CrewAI que envia cada chamada ao gateway central."""

        llm_type: str = "litellm_gateway"
        is_litellm: bool = True
        task_type: str = "general"
        preferred_model: str | None = None
        fallback_model: str | None = None
        credential_model: str | None = None
        timeout: float | int | None = None
        max_retries: int = 0

        @property
        def options(self) -> dict[str, Any]:
            """Visao compativel com os doubles historicos usados pelo projeto."""
            return {
                "model": self.model,
                "api_key": self.api_key,
                "base_url": self.base_url,
                "temperature": self.temperature,
                "max_tokens": self.max_tokens,
                "timeout": self.timeout,
                "max_retries": self.max_retries,
            }

        def call(
            self,
            messages: Any,
            tools: Any = None,
            callbacks: Any = None,
            available_functions: Any = None,
            from_task: Any = None,
            from_agent: Any = None,
            response_model: Any = None,
        ) -> Any:
            del callbacks, available_functions, from_task
            normalized = self._format_messages(messages)
            effective_task = _task_type_from_agent(from_agent, self.task_type)
            request: dict[str, Any] = dict(self.additional_params)
            request.update(
                {
                    "temperature": self.temperature,
                    "top_p": self.top_p,
                    "max_tokens": self.max_tokens,
                    "timeout": self.timeout,
                    "num_retries": self.max_retries,
                    "stop": self.stop_sequences or None,
                    "tools": tools,
                }
            )
            response = call_ai(
                normalized,
                task_type=effective_task,
                preferred_model=self.preferred_model,
                fallback_model=self.fallback_model,
                api_key=self.api_key,
                credential_model=self.credential_model,
                api_base=self.base_url,
                **request,
            )
            usage = extract_usage(response)
            self._track_token_usage_internal(usage)
            text = self._apply_stop_words(response_text(response))
            text = self._invoke_after_llm_call_hooks(normalized, text, from_agent)
            return self._validate_structured_output(text, response_model)

else:
    LiteLLMGatewayCrewAILLM = None  # type: ignore[assignment,misc]


def _task_type_from_agent(agent: Any, default: str) -> str:
    role = str(getattr(agent, "role", "") or "").lower()
    if any(word in role for word in ("supervisor", "gestor", "diretor", "auditor")):
        return "final_review"
    if any(word in role for word in ("analista", "estrateg", "comercial", "vendas")):
        return "analysis"
    return default


def build_crewai_llm(
    *,
    task_type: str = "general",
    preferred_model: str | None = None,
    fallback_model: str | None = None,
    api_key: str | None = None,
    credential_model: str | None = None,
    base_url: str | None = None,
    llm_factory: Callable[..., Any] | None = None,
    **kwargs: Any,
) -> Any:
    """Constroi um LLM compativel com CrewAI sem espalhar configuracao."""
    decision = resolve_model(
        task_type=task_type,
        preferred_model=preferred_model,
        fallback_model=fallback_model,
    )
    from crewai import LLM

    factory = llm_factory or LLM

    real_crewai_base = (
        BaseLLM is not None
        and isinstance(factory, type)
        and issubclass(factory, BaseLLM)
    )
    if LiteLLMGatewayCrewAILLM is None or not real_crewai_base:
        # Compatibilidade com suites que simulam apenas ``crewai.LLM``.

        legacy_kwargs = {
            "model": decision.model,
            "api_key": api_key,
            "base_url": base_url,
            **kwargs,
        }
        return factory(**{k: v for k, v in legacy_kwargs.items() if v is not None})

    return LiteLLMGatewayCrewAILLM(
        model=decision.model,
        task_type=task_type,
        preferred_model=preferred_model,
        fallback_model=fallback_model,
        api_key=api_key,
        credential_model=credential_model or preferred_model or fallback_model,
        base_url=base_url,
        **kwargs,
    )


__all__ = [
    "GatewayConfig",
    "LocalModelConnectionError",
    "LocalModelError",
    "LocalModelUnavailableError",
    "LiteLLMBrowserUseLLM",
    "LiteLLMGatewayCrewAILLM",
    "ModelTier",
    "MonthlyBudgetExceededError",
    "RouteDecision",
    "build_crewai_llm",
    "build_browser_use_llm",
    "call_ai",
    "acall_ai",
    "credentials_available",
    "check_local_model",
    "discover_local_backends",
    "extract_usage",
    "get_budget_status",
    "get_savings_report",
    "get_local_model_report",
    "monthly_spend_brl",
    "resolve_model",
    "response_text",
    "tier_for_task",
]
