import io
import json
import os
import tempfile
import unittest
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from ai_gateway import (
    GatewayConfig,
    LocalModelConnectionError,
    LocalModelError,
    acall_ai,
    call_ai,
    check_local_model,
    get_local_model_report,
)
from code_memory import CodeMemory, MemoryConfig


class FakeHTTPResponse:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, _limit=-1):
        return self.payload


class LocalModelBase:
    def create_environment(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.memory = CodeMemory(
            MemoryConfig(
                db_path=self.root / "memory.sqlite3",
                project_root=self.root,
                max_results=3,
                max_context_chars=180,
            )
        )
        self.config = GatewayConfig(
            cheap_model="mock/cheap",
            medium_model="mock/medium",
            premium_model="mock/premium",
            monthly_budget_brl=1.0,
            usd_to_brl=5.0,
            usage_log_path=self.root / "usage.jsonl",
            cache_enabled=False,
            local_model="openai/qwen-local",
            savings_db_path=self.root / "savings.sqlite3",
            savings_enabled=True,
            local_api_base="http://127.0.0.1:11434/v1",
            local_api_key="dummy-local",
            local_enabled=True,
            allow_paid_fallback=False,
        )

    def destroy_environment(self):
        self.temp_dir.cleanup()

    @staticmethod
    def response(input_tokens=9, output_tokens=1, content="OK"):
        return {
            "choices": [{"message": {"content": content}}],
            "usage": {
                "prompt_tokens": input_tokens,
                "completion_tokens": output_tokens,
                "total_tokens": input_tokens + output_tokens,
            },
        }


class LocalModelSyncTests(LocalModelBase, unittest.TestCase):
    def setUp(self):
        self.create_environment()

    def tearDown(self):
        self.destroy_environment()

    def test_environment_configuration_for_local_route(self):
        values = {
            "AI_LOCAL_MODEL": "openai/local-test",
            "AI_LOCAL_API_BASE": "http://127.0.0.1:8000/v1",
            "AI_LOCAL_API_KEY": "dummy",
            "AI_LOCAL_ENABLED": "true",
            "AI_ALLOW_PAID_FALLBACK": "false",
        }
        with mock.patch.dict(os.environ, values, clear=False):
            config = GatewayConfig.from_env()

        self.assertEqual("openai/local-test", config.local_model)
        self.assertEqual("http://127.0.0.1:8000/v1", config.local_api_base)
        self.assertEqual("dummy", config.local_api_key)
        self.assertTrue(config.local_enabled)
        self.assertFalse(config.allow_paid_fallback)

    def test_sync_local_call_uses_endpoint_memory_and_zero_cost(self):
        self.memory.remember(
            "architecture",
            "O modelo local sempre possui custo monetário zero.",
            confidence=1.0,
            source="unit_test",
        )
        completion = mock.Mock(return_value=self.response())

        call_ai(
            "Retorne OK.",
            tier="local",
            use_memory=True,
            memory_query="modelo local custo zero",
            memory_store=self.memory,
            config=self.config,
            completion_fn=completion,
            cost_fn=lambda **_: 999.0,
        )

        request = completion.call_args.kwargs
        self.assertEqual(self.config.local_api_base, request["api_base"])
        self.assertEqual("dummy-local", request["api_key"])
        self.assertEqual("system", request["messages"][0]["role"])
        record = json.loads(self.config.usage_log_path.read_text(encoding="utf-8"))
        self.assertEqual(0.0, record["estimated_cost_brl"])
        self.assertEqual(9, record["input_tokens"])
        self.assertTrue(record["memory_used"])
        self.assertGreaterEqual(record["latency_ms"], 0.0)

    def test_exhausted_paid_budget_does_not_block_local(self):
        self.config.usage_log_path.write_text(
            json.dumps(
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "estimated_cost_brl": 2.0,
                }
            )
            + "\n",
            encoding="utf-8",
        )
        completion = mock.Mock(return_value=self.response())

        call_ai(
            "OK",
            tier="local",
            config=self.config,
            completion_fn=completion,
        )

        completion.assert_called_once()

    def test_paid_fallback_is_blocked_before_completion(self):
        completion = mock.Mock(return_value=self.response())

        with self.assertRaises(LocalModelError):
            call_ai(
                "OK",
                tier="local",
                config=self.config,
                completion_fn=completion,
                fallbacks=["openai/paid-model"],
            )

        completion.assert_not_called()

    def test_connection_failure_becomes_controlled_local_error(self):
        completion = mock.Mock(side_effect=OSError("connection refused"))

        with self.assertRaises(LocalModelConnectionError):
            call_ai(
                "OK",
                tier="local",
                config=self.config,
                completion_fn=completion,
            )

        record = json.loads(self.config.usage_log_path.read_text(encoding="utf-8"))
        self.assertEqual("LocalModelConnectionError", record["error_type"])
        self.assertNotIn("connection refused", self.config.usage_log_path.read_text())

    def test_health_check_lists_model_without_generation(self):
        opener = mock.Mock(
            return_value=FakeHTTPResponse(
                {"object": "list", "data": [{"id": "qwen-local"}]}
            )
        )

        status = check_local_model(
            self.config,
            timeout_seconds=0.1,
            urlopen_fn=opener,
        )

        self.assertTrue(status["endpoint_available"])
        self.assertTrue(status["model_available"])
        self.assertEqual("Ollama (OpenAI-compatible)", status["backend"])
        request = opener.call_args.args[0]
        self.assertTrue(request.full_url.endswith("/models"))

    def test_health_check_reports_unavailable_backend(self):
        def unavailable(*_args, **_kwargs):
            raise urllib.error.URLError("offline")

        status = check_local_model(self.config, urlopen_fn=unavailable)

        self.assertFalse(status["endpoint_available"])
        self.assertEqual("URLError", status["error_type"])

    def test_local_report_aggregates_real_usage_without_content(self):
        call_ai(
            "OK",
            tier="local",
            config=self.config,
            completion_fn=mock.Mock(return_value=self.response(11, 2)),
        )
        health = {
            "backend": "Mock local",
            "endpoint_available": True,
            "model_available": True,
        }

        report = get_local_model_report(self.config, health_status=health)

        self.assertEqual(1, report["calls"])
        self.assertEqual(11, report["input_tokens"])
        self.assertEqual(2, report["output_tokens"])
        self.assertEqual(0.0, report["cost_brl"])
        self.assertFalse(report["paid_fallback_allowed"])

    def test_sensitive_env_file_cannot_enter_memory_context(self):
        sensitive = self.root / ".env"
        sensitive.write_text("API_KEY=secret", encoding="utf-8")

        with self.assertRaises(ValueError):
            self.memory.remember(
                "error",
                "Não deve persistir",
                related_file=sensitive,
                source="unit_test",
            )


class LocalModelAsyncTests(LocalModelBase, unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.create_environment()

    def tearDown(self):
        self.destroy_environment()

    async def test_async_local_call_matches_sync_policy(self):
        completion = mock.AsyncMock(return_value=self.response(7, 1))

        await acall_ai(
            "Retorne OK.",
            tier="local",
            config=self.config,
            completion_fn=completion,
        )

        request = completion.await_args.kwargs
        self.assertEqual(self.config.local_api_base, request["api_base"])
        record = json.loads(self.config.usage_log_path.read_text(encoding="utf-8"))
        self.assertEqual(0.0, record["estimated_cost_brl"])
        self.assertEqual(7, record["input_tokens"])


if __name__ == "__main__":
    unittest.main()
