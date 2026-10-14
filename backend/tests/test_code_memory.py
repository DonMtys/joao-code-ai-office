import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from code_memory import CodeMemory, MemoryConfig


class CodeMemoryTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.project_root = Path(self.temp_dir.name) / "project"
        self.project_root.mkdir()
        self.db_path = self.project_root / "storage" / "code_memory.sqlite3"
        self.config = MemoryConfig(
            db_path=self.db_path,
            project_root=self.project_root,
            max_results=3,
            max_context_chars=120,
            max_age_days=None,
            min_confidence=0.5,
        )
        self.memory = CodeMemory(self.config)

    def tearDown(self):
        self.temp_dir.cleanup()

    def create_file(self, name: str, content: str = "pass\n") -> Path:
        path = self.project_root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def test_persists_across_program_restart(self):
        source = self.create_file("service.py", "def route():\n    return 'cheap'\n")
        saved = self.memory.remember(
            memory_type="responsibility",
            content="Seleciona o nível de modelo para cada tarefa.",
            related_file=source,
            related_symbol="route",
            confidence=0.95,
            source="unit_test",
        )

        reopened = CodeMemory(self.config)
        records = reopened.get_file_memory(source)

        self.assertEqual(1, len(records))
        self.assertEqual(saved["id"], records[0]["id"])
        self.assertEqual("route", records[0]["related_symbol"])
        self.assertEqual(64, len(records[0]["file_hash"]))
        self.assertGreater(self.db_path.stat().st_size, 0)

    def test_search_filters_and_orders_relevant_memories(self):
        self.memory.remember(
            "architecture",
            "O roteamento de modelos baratos ocorre no gateway.",
            confidence=0.9,
            source="manual",
        )
        self.memory.remember(
            "decision",
            "Roteamento premium só ocorre quando a tarefa exige.",
            confidence=0.8,
            source="manual",
        )
        self.memory.remember(
            "decision",
            "Roteamento experimental ainda não foi validado.",
            confidence=0.2,
            source="manual",
        )
        self.memory.remember(
            "error",
            "Erro de renderização da sala 3D.",
            confidence=1.0,
            source="manual",
        )

        results = self.memory.search_memory("roteamento modelos")

        self.assertEqual(2, len(results))
        self.assertIn("gateway", results[0]["content"].lower())
        self.assertTrue(all(item["confidence"] >= 0.5 for item in results))

    def test_update_reuses_memory_when_file_is_unchanged(self):
        source = self.create_file("gateway.py")
        first = self.memory.update_file_memory(
            source,
            [{"type": "function", "content": "Gateway atual", "symbol": "call_ai"}],
        )
        second = self.memory.update_file_memory(
            source,
            [{"type": "function", "content": "Conteúdo que não deve substituir", "symbol": "call_ai"}],
        )

        records = self.memory.get_file_memory(source)
        self.assertEqual(1, first["created"])
        self.assertFalse(first["reused"])
        self.assertEqual(0, second["created"])
        self.assertTrue(second["reused"])
        self.assertEqual("Gateway atual", records[0]["content"])

    def test_changed_file_invalidates_only_its_memories(self):
        changed = self.create_file("changed.py", "VERSION = 1\n")
        untouched = self.create_file("untouched.py", "STABLE = True\n")
        self.memory.update_file_memory(
            changed,
            [{"type": "decision", "content": "Versão antiga"}],
        )
        self.memory.update_file_memory(
            untouched,
            [{"type": "responsibility", "content": "Arquivo estável"}],
        )

        changed.write_text("VERSION = 2\n", encoding="utf-8")
        self.assertEqual([], self.memory.get_file_memory(changed))

        stale = self.memory.get_file_memory(changed, include_stale=True)
        stable = self.memory.get_file_memory(untouched)
        self.assertEqual(1, len(stale))
        self.assertTrue(stale[0]["is_stale"])
        self.assertEqual(1, len(stable))
        self.assertFalse(stable[0]["is_stale"])

    def test_changed_file_can_be_updated_without_reindexing_others(self):
        changed = self.create_file("changed.py", "VALUE = 1\n")
        untouched = self.create_file("untouched.py", "VALUE = 10\n")
        self.memory.update_file_memory(changed, [{"type": "function", "content": "Estado 1"}])
        self.memory.update_file_memory(untouched, [{"type": "function", "content": "Estado estável"}])

        changed.write_text("VALUE = 2\n", encoding="utf-8")
        result = self.memory.update_file_memory(
            changed,
            [{"type": "function", "content": "Estado 2", "confidence": 0.9}],
        )

        self.assertEqual(1, result["invalidated"])
        self.assertEqual(1, result["created"])
        self.assertEqual("Estado 2", self.memory.get_file_memory(changed)[0]["content"])
        self.assertEqual("Estado estável", self.memory.get_file_memory(untouched)[0]["content"])

    def test_forget_stale_memory_removes_invalidated_records(self):
        source = self.create_file("module.py", "A = 1\n")
        self.memory.update_file_memory(source, [{"type": "error", "content": "Erro corrigido"}])
        source.write_text("A = 2\n", encoding="utf-8")
        self.memory.get_file_memory(source)

        deleted = self.memory.forget_stale_memory()

        self.assertEqual(1, deleted)
        self.assertEqual([], self.memory.get_file_memory(source, include_stale=True))

    def test_result_and_context_limits_are_enforced(self):
        for index in range(5):
            self.memory.remember(
                "architecture",
                f"Gateway roteamento memória {index} " + ("x" * 80),
                confidence=0.9,
                source="unit_test",
            )

        results = self.memory.search_memory(
            "gateway roteamento",
            limit=99,
            max_context_chars=70,
        )
        context = self.memory.format_context(results, max_context_chars=70)

        self.assertLessEqual(len(results), 3)
        self.assertLessEqual(sum(len(item["content"]) for item in results), 70)
        self.assertLessEqual(len(context), 70)

    def test_optional_maximum_age_filters_old_records(self):
        record = self.memory.remember(
            "decision",
            "Decisão antiga sobre roteamento",
            confidence=0.9,
            source="unit_test",
        )
        old_time = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        connection = sqlite3.connect(self.db_path)
        try:
            connection.execute(
                "UPDATE memories SET created_at = ?, updated_at = ? WHERE id = ?",
                (old_time, old_time, record["id"]),
            )
            connection.commit()
        finally:
            connection.close()

        results = self.memory.search_memory("roteamento", max_age_days=7)

        self.assertEqual([], results)

    def test_excluded_directories_are_not_indexed(self):
        dependency = self.create_file("node_modules/vendor/index.js", "export default 1;\n")

        with self.assertRaises(ValueError):
            self.memory.remember(
                "dependency",
                "Dependência externa",
                related_file=dependency,
                confidence=1.0,
                source="unit_test",
            )

    def test_secrets_are_redacted_before_persistence(self):
        record = self.memory.remember(
            "error",
            "api_key=super-secret-value",
            confidence=1.0,
            source="unit_test",
        )

        self.assertNotIn("super-secret-value", record["content"])
        self.assertIn("REDACTED", record["content"])


if __name__ == "__main__":
    unittest.main()
