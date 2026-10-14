import json
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from ai_gateway import GatewayConfig, acall_ai, call_ai, get_savings_report
from code_memory import CodeMemory, MemoryConfig


def fake_response(input_tokens=20):
    return {
        "choices": [{"message": {"content": "ok"}}],
        "usage": {"prompt_tokens": input_tokens, "completion_tokens": 2},
    }


class Stage4Base:
    def create_environment(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.memory_config = MemoryConfig(
                db_path=self.root / "memory.sqlite3",
                project_root=self.root,
                max_results=5,
                max_context_chars=180,
                min_confidence=0.4,
        )
        self.memory = CodeMemory(self.memory_config)
        self.gateway = GatewayConfig(
            cheap_model="mock/cheap",
            medium_model="mock/medium",
            premium_model="mock/premium",
            monthly_budget_brl=100.0,
            usd_to_brl=5.0,
            usage_log_path=self.root / "usage.jsonl",
            cache_enabled=False,
            local_model="mock/local",
            savings_db_path=self.root / "savings.sqlite3",
            savings_enabled=True,
        )

    def destroy_environment(self):
        self.temp_dir.cleanup()


class AsyncMemoryTests(Stage4Base, unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.create_environment()

    def tearDown(self):
        self.destroy_environment()

    async def test_acall_ai_has_the_same_optional_memory_flow(self):
        self.memory.remember(
            "architecture",
            "O fluxo assíncrono reutiliza a mesma memória persistente.",
            confidence=0.9,
            source="unit_test",
        )
        completion = mock.AsyncMock(return_value=fake_response(42))

        await acall_ai(
            "Analise o fluxo.",
            task_type="coding",
            use_memory=True,
            memory_query="fluxo assíncrono memória",
            memory_symbols=["acall_ai"],
            memory_store=self.memory,
            config=self.gateway,
            completion_fn=completion,
            cost_fn=lambda **_: 0.0,
        )

        sent = completion.await_args.kwargs["messages"]
        self.assertEqual("system", sent[0]["role"])
        self.assertIn("fluxo assíncrono", sent[0]["content"])
        log = json.loads(self.gateway.usage_log_path.read_text(encoding="utf-8"))
        self.assertTrue(log["memory_used"])
        self.assertEqual(42, log["provider_input_tokens"])
        self.assertIsNotNone(log["estimated_token_error_percent"])
        report = get_savings_report(self.gateway)
        self.assertEqual(1, report["calls_analyzed"])
        self.assertEqual(1, report["calls_with_memory"])


class FileMetricsAndSearchTests(Stage4Base, unittest.TestCase):
    def setUp(self):
        self.create_environment()

    def tearDown(self):
        self.destroy_environment()

    def test_file_metrics_are_reused_until_the_file_changes(self):
        source = self.root / "module.py"
        source.write_text("def route():\n    return 'cheap'\n", encoding="utf-8")

        first = self.memory.update_file_memory(
            source,
            [{"type": "architecture", "content": "Roteamento barato"}],
        )
        second = self.memory.update_file_memory(
            source,
            [{"type": "architecture", "content": "Não deve reindexar"}],
        )
        source.write_text(
            "def route():\n    return 'premium-after-change'\n", encoding="utf-8"
        )
        third = self.memory.update_file_memory(
            source,
            [{"type": "architecture", "content": "Roteamento atualizado"}],
        )

        self.assertGreater(first["file_size_bytes"], 0)
        self.assertGreater(first["file_characters"], 0)
        self.assertGreater(first["estimated_tokens"], 0)
        self.assertTrue(second["reused_file_metrics"])
        self.assertFalse(third["reused_file_metrics"])
        self.assertNotEqual(first["file_hash"], third["file_hash"])

    def test_fts5_and_like_fallback_return_relevant_memory(self):
        self.memory.remember(
            "architecture",
            "Roteamento econômico de modelos pelo gateway central.",
            confidence=0.9,
            source="unit_test",
        )

        primary = self.memory.search_memory("roteamento econômico gateway")
        fts_available = self.memory.fts5_available
        self.memory.fts5_available = False
        fallback = self.memory.search_memory("roteamento econômico gateway")

        self.assertEqual(1, len(primary))
        self.assertEqual(1, len(fallback))
        self.assertIsInstance(fts_available, bool)

    def test_old_database_is_migrated_without_losing_memory(self):
        old_db = self.root / "old.sqlite3"
        connection = sqlite3.connect(old_db)
        try:
            connection.executescript(
                """
                CREATE TABLE memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    memory_type TEXT NOT NULL, content TEXT NOT NULL,
                    related_file TEXT, related_symbol TEXT,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    file_hash TEXT, confidence REAL NOT NULL,
                    source TEXT NOT NULL, is_stale INTEGER NOT NULL DEFAULT 0,
                    stale_at TEXT, metadata_json TEXT NOT NULL DEFAULT '{}'
                );
                CREATE TABLE file_states (
                    related_file TEXT PRIMARY KEY,
                    file_hash TEXT NOT NULL,
                    checked_at TEXT NOT NULL
                );
                """
            )
            connection.commit()
        finally:
            connection.close()

        migrated = CodeMemory(
            MemoryConfig(db_path=old_db, project_root=self.root)
        )
        migrated.remember("decision", "Banco migrado", source="unit_test")
        check = sqlite3.connect(old_db)
        try:
            file_columns = {
                row[1] for row in check.execute("PRAGMA table_info(file_states)")
            }
            memory_columns = {
                row[1] for row in check.execute("PRAGMA table_info(memories)")
            }
        finally:
            check.close()
        self.assertIn("estimated_tokens", file_columns)
        self.assertIn("retrieval_count", memory_columns)
        self.assertEqual(1, len(migrated.search_memory("Banco migrado")))


class SavingsAndAutomaticMemoryTests(Stage4Base, unittest.TestCase):
    def setUp(self):
        self.create_environment()

    def tearDown(self):
        self.destroy_environment()

    def test_savings_are_persistent_and_grouped(self):
        source = self.root / "gateway.py"
        source.write_text("def route(): pass\n", encoding="utf-8")
        self.memory.remember(
            "architecture",
            "Roteamento " + ("econômico " * 80),
            related_file=source,
            related_symbol="route",
            confidence=1.0,
            source="unit_test",
        )
        completion = mock.Mock(return_value=fake_response(37))

        call_ai(
            "Tarefa curta.",
            task_type="coding",
            tier="cheap",
            use_memory=True,
            memory_query="roteamento econômico",
            memory_files=[source],
            memory_store=self.memory,
            config=self.gateway,
            completion_fn=completion,
            cost_fn=lambda **_: 0.0,
        )
        call_ai(
            "Outra tarefa.",
            task_type="research",
            tier="medium",
            config=self.gateway,
            completion_fn=mock.Mock(return_value=fake_response(3)),
            cost_fn=lambda **_: 0.0,
        )

        report = get_savings_report(self.gateway)
        self.assertEqual(2, report["calls_analyzed"])
        self.assertEqual(1, report["calls_with_memory"])
        self.assertEqual(1, report["calls_without_memory"])
        self.assertGreater(report["estimated_tokens_saved"], 0)
        self.assertEqual("gateway.py", report["by_file"][0]["related_file"])
        self.assertEqual({"coding", "research"}, {item["task_type"] for item in report["by_task"]})
        self.assertIsNotNone(report["average_estimation_error_percent"])

    def test_structured_events_are_saved_only_after_success(self):
        source = self.root / "gateway.py"
        source.write_text("def call_ai(): pass\n", encoding="utf-8")
        event = {
            "type": "test_result",
            "file_path": source,
            "symbol": "call_ai",
            "content": "Testes offline concluídos com sucesso.",
            "confidence": 0.98,
        }

        call_ai(
            "Execute testes.",
            memory_store=self.memory,
            memory_events=[event],
            config=self.gateway,
            completion_fn=mock.Mock(return_value=fake_response()),
            cost_fn=lambda **_: 0.0,
        )

        records = self.memory.get_file_memory(source)
        self.assertEqual(1, len(records))
        self.assertEqual("agent_generated", records[0]["source"])
        self.assertEqual(0.98, records[0]["confidence"])
        self.assertEqual("test_result", records[0]["memory_type"])

    def test_useless_memory_detection_is_non_destructive(self):
        low = self.memory.remember(
            "decision", "Memória de baixa confiança", confidence=0.1, source="test"
        )
        removed_file = self.root / "removed.py"
        removed_file.write_text("VALUE = 1\n", encoding="utf-8")
        removed = self.memory.remember(
            "solution",
            "Solução ligada a arquivo removido",
            related_file=removed_file,
            confidence=0.9,
            source="test",
        )
        removed_file.unlink()
        old_time = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
        connection = sqlite3.connect(self.memory_config.db_path)
        try:
            connection.execute(
                "UPDATE memories SET created_at = ? WHERE id = ?",
                (old_time, low["id"]),
            )
            connection.commit()
        finally:
            connection.close()

        candidates = self.memory.find_useless_memory(
            low_confidence_threshold=0.3,
            never_retrieved_days=30,
        )
        reasons = {item["id"]: set(item["useless_reasons"]) for item in candidates}
        self.assertIn("low_confidence", reasons[low["id"]])
        self.assertIn("never_retrieved", reasons[low["id"]])
        self.assertIn("file_removed", reasons[removed["id"]])
        self.assertEqual(2, len(self.memory.search_memory("Memória Solução", min_confidence=0.0)))


if __name__ == "__main__":
    unittest.main()
