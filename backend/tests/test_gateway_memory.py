import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from ai_gateway import GatewayConfig, MonthlyBudgetExceededError, call_ai
from code_memory import (
    CodeMemory,
    MemoryConfig,
    remember_architecture,
    remember_decision,
    remember_error,
    remember_solution,
)
from context_metrics import (
    count_message_characters,
    estimate_tokens,
    measure_context_reduction,
)


class GatewayMemoryTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.log_path = self.root / "usage.jsonl"
        self.memory_config = MemoryConfig(
            db_path=self.root / "memory.sqlite3",
            project_root=self.root,
            max_results=3,
            max_context_chars=240,
            min_confidence=0.5,
        )
        self.memory = CodeMemory(self.memory_config)
        self.gateway_config = self._gateway_config()

    def tearDown(self):
        self.temp_dir.cleanup()

    def _gateway_config(self, *, budget=100.0, local_model=""):
        return GatewayConfig(
            cheap_model="mock/cheap",
            medium_model="mock/medium",
            premium_model="mock/premium",
            monthly_budget_brl=budget,
            usd_to_brl=5.0,
            usage_log_path=self.log_path,
            cache_enabled=False,
            local_model=local_model,
        )

    @staticmethod
    def _response():
        return {
            "choices": [{"message": {"content": "ok"}}],
            "usage": {"prompt_tokens": 4, "completion_tokens": 1},
        }

    def _last_log(self):
        return json.loads(self.log_path.read_text(encoding="utf-8").splitlines()[-1])

    def test_call_without_memory_preserves_messages(self):
        completion = mock.Mock(return_value=self._response())

        call_ai(
            "mensagem original",
            config=self.gateway_config,
            completion_fn=completion,
            cost_fn=lambda **_: 0.0,
        )

        self.assertEqual(
            [{"role": "user", "content": "mensagem original"}],
            completion.call_args.kwargs["messages"],
        )
        log = self._last_log()
        self.assertFalse(log["memory_used"])
        self.assertEqual(0, log["memory_results"])

    def test_call_with_memory_injects_small_context_and_logs_metrics(self):
        self.memory.remember(
            "architecture",
            "O gateway escolhe modelos baratos para tarefas simples.",
            confidence=0.9,
            source="unit_test",
        )
        completion = mock.Mock(return_value=self._response())

        call_ai(
            "Implemente o roteamento.",
            task_type="coding",
            use_memory=True,
            memory_query="gateway modelos baratos",
            memory_store=self.memory,
            config=self.gateway_config,
            completion_fn=completion,
            cost_fn=lambda **_: 0.0,
        )

        sent = completion.call_args.kwargs["messages"]
        self.assertEqual("system", sent[0]["role"])
        self.assertIn("gateway escolhe modelos baratos", sent[0]["content"])
        log_text = self.log_path.read_text(encoding="utf-8")
        log = json.loads(log_text)
        self.assertTrue(log["memory_used"])
        self.assertEqual(1, log["memory_results"])
        self.assertGreater(log["memory_context_chars"], 0)
        self.assertIn("estimated_context_tokens", log)
        self.assertIn("estimated_tokens_saved", log)
        self.assertNotIn("gateway escolhe modelos baratos", log_text)

    def test_invalidated_memory_is_ignored(self):
        source = self.root / "changed.py"
        source.write_text("VALUE = 1\n", encoding="utf-8")
        self.memory.remember(
            "decision",
            "A versão antiga usa roteamento legado.",
            related_file=source,
            confidence=1.0,
            source="unit_test",
        )
        source.write_text("VALUE = 2\n", encoding="utf-8")
        completion = mock.Mock(return_value=self._response())

        call_ai(
            "Analise o arquivo.",
            use_memory=True,
            memory_query="roteamento legado",
            memory_files=[source],
            memory_store=self.memory,
            config=self.gateway_config,
            completion_fn=completion,
            cost_fn=lambda **_: 0.0,
        )

        self.assertEqual(1, len(completion.call_args.kwargs["messages"]))
        self.assertFalse(self._last_log()["memory_used"])

    def test_context_already_in_messages_is_not_duplicated(self):
        content = "A validação do tier acontece antes do roteamento."
        self.memory.remember(
            "solution", content, confidence=1.0, source="unit_test"
        )
        completion = mock.Mock(return_value=self._response())

        call_ai(
            content,
            use_memory=True,
            memory_query="validação tier roteamento",
            memory_store=self.memory,
            config=self.gateway_config,
            completion_fn=completion,
            cost_fn=lambda **_: 0.0,
        )

        self.assertEqual(1, len(completion.call_args.kwargs["messages"]))
        self.assertFalse(self._last_log()["memory_used"])

    def test_budget_blocks_paid_route_after_memory_preparation(self):
        self.memory.remember(
            "architecture",
            "Memória útil para revisão premium.",
            confidence=1.0,
            source="unit_test",
        )
        self.log_path.write_text(
            json.dumps(
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "estimated_cost_brl": 1.0,
                }
            )
            + "\n",
            encoding="utf-8",
        )
        completion = mock.Mock(return_value=self._response())

        with self.assertRaises(MonthlyBudgetExceededError):
            call_ai(
                "Revise.",
                tier="premium",
                use_memory=True,
                memory_query="memória revisão premium",
                memory_store=self.memory,
                config=self._gateway_config(budget=1.0),
                completion_fn=completion,
            )

        completion.assert_not_called()
        log = self._last_log()
        self.assertTrue(log["blocked_by_budget"])
        self.assertTrue(log["memory_used"])

    def test_local_route_uses_memory_after_paid_budget_is_exhausted(self):
        self.memory.remember(
            "architecture",
            "O modelo local custa zero por token.",
            confidence=1.0,
            source="unit_test",
        )
        self.log_path.write_text(
            json.dumps(
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "estimated_cost_brl": 2.0,
                }
            )
            + "\n",
            encoding="utf-8",
        )
        completion = mock.Mock(return_value=self._response())

        call_ai(
            "Execute localmente.",
            tier="local",
            use_memory=True,
            memory_query="modelo local token",
            memory_store=self.memory,
            config=self._gateway_config(budget=1.0, local_model="ollama/local"),
            completion_fn=completion,
            cost_fn=lambda **_: 99.0,
        )

        self.assertEqual("ollama/local", completion.call_args.kwargs["model"])
        self.assertEqual("system", completion.call_args.kwargs["messages"][0]["role"])
        log = self._last_log()
        self.assertTrue(log["memory_used"])
        self.assertEqual(0.0, log["estimated_cost_brl"])


class MemoryContextTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.config = MemoryConfig(
            db_path=self.root / "memory.sqlite3",
            project_root=self.root,
            max_results=2,
            max_context_chars=100,
            min_confidence=0.5,
        )
        self.memory = CodeMemory(self.config)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_task_context_prioritizes_file_and_respects_limits(self):
        source = self.root / "gateway.py"
        source.write_text("def call_ai(): pass\n", encoding="utf-8")
        self.memory.remember(
            "architecture",
            "Informação do arquivo explicitamente solicitado.",
            related_file=source,
            related_symbol="call_ai",
            confidence=0.8,
            source="unit_test",
        )
        for index in range(4):
            self.memory.remember(
                "decision",
                f"Roteamento geral relevante {index} " + ("x" * 80),
                confidence=1.0,
                source="unit_test",
            )

        result = self.memory.build_task_context(
            "roteamento geral",
            files=[source],
            symbols=["call_ai"],
            limit=99,
            max_context_chars=99,
        )

        self.assertLessEqual(result["memory_results"], 2)
        self.assertLessEqual(result["memory_context_chars"], 99)
        self.assertEqual("gateway.py", result["memories"][0]["related_file"])

    def test_event_helpers_persist_decisions_errors_solutions_and_architecture(self):
        source = self.root / "gateway.py"
        source.write_text("def call_ai(): pass\n", encoding="utf-8")
        for helper, expected_type in (
            (remember_decision, "decision"),
            (remember_error, "error"),
            (remember_solution, "solution"),
            (remember_architecture, "architecture"),
        ):
            saved = helper(
                file_path=source,
                symbol="call_ai",
                content=f"Evento {expected_type}",
                memory=self.memory,
                source="unit_test",
            )
            self.assertEqual(expected_type, saved["memory_type"])

        reopened = CodeMemory(self.config)
        records = reopened.get_file_memory(source)
        self.assertEqual(4, len(records))
        self.assertEqual(
            {"decision", "error", "solution", "architecture"},
            {record["memory_type"] for record in records},
        )


class ContextMetricsTests(unittest.TestCase):
    def test_estimated_token_reduction(self):
        metrics = measure_context_reduction(400, 100)

        self.assertEqual(100, metrics.estimated_original_tokens)
        self.assertEqual(25, metrics.estimated_sent_tokens)
        self.assertEqual(75, metrics.estimated_tokens_saved)
        self.assertEqual(75.0, metrics.estimated_reduction_percent)
        self.assertEqual(100, estimate_tokens("x" * 400))

    def test_message_character_count_handles_structured_content(self):
        messages = [
            {"role": "user", "content": "abc"},
            {"role": "user", "content": [{"type": "text", "text": "defg"}]},
        ]
        self.assertEqual(7, count_message_characters(messages))


if __name__ == "__main__":
    unittest.main()
