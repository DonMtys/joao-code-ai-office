import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from ai_gateway import (
    GatewayConfig,
    ModelTier,
    MonthlyBudgetExceededError,
    acall_ai,
    build_browser_use_llm,
    call_ai,
    get_budget_status,
    build_crewai_llm,
    resolve_model,
    response_text,
    tier_for_task,
)


class AIGatewayTests(unittest.TestCase):
    def _config(
        self,
        log_path: Path,
        budget: float = 100.0,
        local_model: str = "",
    ) -> GatewayConfig:
        return GatewayConfig(
            cheap_model="gemini/flash",
            medium_model="deepseek/chat",
            premium_model="openai/premium",
            monthly_budget_brl=budget,
            usd_to_brl=5.0,
            usage_log_path=log_path,
            cache_enabled=False,
            local_model=local_model,
        )

    def test_routes_tasks_to_three_tiers(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = self._config(Path(tmp) / "usage.jsonl")
            self.assertEqual(ModelTier.CHEAP, tier_for_task("research"))
            self.assertEqual(ModelTier.MEDIUM, tier_for_task("analysis"))
            self.assertEqual(ModelTier.PREMIUM, tier_for_task("final_review"))
            self.assertEqual(
                "deepseek/chat",
                resolve_model(task_type="analysis", config=config).model,
            )

    def test_budget_blocks_paid_call_at_one_hundred_percent(self):
        with tempfile.TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "usage.jsonl"
            config = self._config(log_path, budget=1.0)
            log_path.write_text(
                json.dumps(
                    {
                        "timestamp": "2099-01-01T00:00:00+00:00",
                        "estimated_cost_brl": 2.0,
                    }
                ),
                encoding="utf-8",
            )
            # Usa o mes atual para que o teste nao dependa de data fixa.
            from datetime import datetime, timezone

            record = json.loads(log_path.read_text(encoding="utf-8"))
            record["timestamp"] = datetime.now(timezone.utc).isoformat()
            log_path.write_text(json.dumps(record) + "\n", encoding="utf-8")

            completion = mock.Mock()
            with self.assertRaises(MonthlyBudgetExceededError):
                call_ai(
                    "teste",
                    task_type="final_review",
                    config=config,
                    completion_fn=completion,
                )
            completion.assert_not_called()
            records = [json.loads(line) for line in log_path.read_text().splitlines()]
            self.assertTrue(records[-1]["blocked_by_budget"])

    def test_budget_status_returns_values_and_summary(self):
        with tempfile.TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "usage.jsonl"
            config = self._config(log_path, budget=100.0)
            from datetime import datetime, timezone

            log_path.write_text(
                json.dumps(
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "estimated_cost_brl": 12.4,
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            status = get_budget_status(config)
            self.assertEqual(12.4, status["spent_brl"])
            self.assertEqual(87.6, status["remaining_brl"])
            self.assertEqual(12.4, status["usage_percent"])
            self.assertIn("R$ 12,40", status["summary"])

    def test_explicit_tier_overrides_task_routing(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = self._config(Path(tmp) / "usage.jsonl")
            captured = {}

            def fake_completion(**kwargs):
                captured.update(kwargs)
                return {"choices": [{"message": {"content": "ok"}}], "usage": {}}

            call_ai(
                "teste",
                task_type="coding",
                tier="cheap",
                config=config,
                completion_fn=fake_completion,
                cost_fn=lambda **_: 0.0,
            )
            self.assertEqual("gemini/flash", captured["model"])

    def test_local_model_is_allowed_after_budget_and_costs_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "usage.jsonl"
            config = self._config(log_path, budget=1.0, local_model="ollama/local")
            from datetime import datetime, timezone

            log_path.write_text(
                json.dumps(
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "estimated_cost_brl": 1.0,
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            response = call_ai(
                "teste",
                tier="local",
                config=config,
                completion_fn=lambda **_: {
                    "choices": [{"message": {"content": "local-ok"}}],
                    "usage": {"prompt_tokens": 5, "completion_tokens": 2},
                },
                cost_fn=lambda **_: 99.0,
            )
            self.assertEqual("local-ok", response_text(response))
            records = [json.loads(line) for line in log_path.read_text().splitlines()]
            self.assertEqual(0.0, records[-1]["estimated_cost_brl"])
            self.assertTrue(records[-1]["local_model"])

    def test_call_uses_mock_and_logs_only_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "usage.jsonl"
            config = self._config(log_path)
            captured = {}

            def fake_completion(**kwargs):
                captured.update(kwargs)
                return {
                    "choices": [{"message": {"content": "resposta simulada"}}],
                    "usage": {
                        "prompt_tokens": 7,
                        "completion_tokens": 3,
                        "total_tokens": 10,
                    },
                }

            response = call_ai(
                [{"role": "user", "content": "conteudo secreto"}],
                task_type="analysis",
                config=config,
                completion_fn=fake_completion,
                cost_fn=lambda **_: 0.02,
                api_key="test-only-placeholder",
                credential_model="deepseek/chat",
            )

            self.assertEqual("resposta simulada", response_text(response))
            self.assertEqual("deepseek/chat", captured["model"])
            self.assertEqual("test-only-placeholder", captured["api_key"])
            record_text = log_path.read_text(encoding="utf-8")
            record = json.loads(record_text)
            self.assertEqual(7, record["input_tokens"])
            self.assertEqual(3, record["output_tokens"])
            self.assertEqual(0.1, record["estimated_cost_brl"])
            self.assertNotIn("conteudo secreto", record_text)
            self.assertNotIn("chave-secreta", record_text)

    @mock.patch("ai_gateway.call_ai")
    def test_crewai_adapter_calls_gateway(self, mocked_call):
        mocked_call.return_value = {
            "choices": [{"message": {"content": "ok"}}],
            "usage": {"prompt_tokens": 2, "completion_tokens": 1},
        }
        llm = build_crewai_llm(preferred_model="openai/mock")
        self.assertEqual("ok", llm.call("teste"))
        mocked_call.assert_called_once()


class BrowserGatewayTests(unittest.IsolatedAsyncioTestCase):
    async def test_async_call_uses_mock_without_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = GatewayConfig(
                "openai/mock",
                "openai/mock",
                "openai/mock",
                100.0,
                5.0,
                Path(tmp) / "usage.jsonl",
                False,
            )

            async def fake_completion(**_kwargs):
                return {
                    "choices": [{"message": {"content": "async-ok"}}],
                    "usage": {"prompt_tokens": 2, "completion_tokens": 1},
                }

            response = await acall_ai(
                "teste",
                config=config,
                completion_fn=fake_completion,
                cost_fn=lambda **_: 0.0,
            )
            self.assertEqual("async-ok", response_text(response))

    @mock.patch("ai_gateway.acall_ai", new_callable=mock.AsyncMock)
    async def test_browser_use_adapter_calls_gateway(self, mocked_call):
        from browser_use.llm.base import BaseChatModel
        from browser_use.llm.messages import UserMessage

        mocked_call.return_value = {
            "choices": [{"message": {"content": "browser-ok"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 4, "completion_tokens": 2},
        }
        llm = build_browser_use_llm(preferred_model="openai/mock")
        self.assertIsInstance(llm, BaseChatModel)
        result = await llm.ainvoke([UserMessage(content="teste")])
        self.assertEqual("browser-ok", result.completion)
        self.assertEqual(6, result.usage.total_tokens)
        mocked_call.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
