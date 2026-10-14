import json
import tempfile
import unittest
from pathlib import Path

from agent_office_events import (
    build_handoff_callback,
    publish_agent_handoff,
    publish_office_status,
)


class FakeTaskOutput:
    raw = "Relatório concluído com três oportunidades verificadas."


class AgentOfficeEventTests(unittest.TestCase):
    def test_persists_structured_handoff_offline(self):
        with tempfile.TemporaryDirectory() as directory:
            event_file = Path(directory) / "events.jsonl"
            event = publish_agent_handoff(
                "pesquisador",
                "analista",
                "Pesquisa concluída",
                task="Pesquisa",
                event_file=event_file,
            )

            stored = json.loads(event_file.read_text(encoding="utf-8").strip())
            self.assertEqual(stored, event)
            self.assertEqual(stored["type"], "agent_handoff")
            self.assertEqual(stored["source"], "crewai")

    def test_redacts_credentials_and_limits_text(self):
        with tempfile.TemporaryDirectory() as directory:
            event = publish_agent_handoff(
                "analista",
                "comercial",
                "API_KEY=segredo-que-nao-pode-vazar " + ("x" * 300),
                event_file=Path(directory) / "events.jsonl",
            )

            self.assertNotIn("segredo-que-nao-pode-vazar", event["text"])
            self.assertLessEqual(len(event["text"]), 180)

    def test_rejects_unknown_or_equal_agents(self):
        with tempfile.TemporaryDirectory() as directory:
            event_file = Path(directory) / "events.jsonl"
            with self.assertRaises(ValueError):
                publish_agent_handoff("desconhecido", "analista", "x", event_file=event_file)
            with self.assertRaises(ValueError):
                publish_agent_handoff("analista", "analista", "x", event_file=event_file)

    def test_crewai_callback_uses_real_task_output(self):
        with tempfile.TemporaryDirectory() as directory:
            event_file = Path(directory) / "events.jsonl"
            # O caminho configurável permite testar o callback sem servidor nem IA.
            import os

            previous = os.environ.get("AGENT_OFFICE_EVENT_FILE")
            os.environ["AGENT_OFFICE_EVENT_FILE"] = str(event_file)
            try:
                callback = build_handoff_callback("executor", "supervisor", "Operação validada")
                callback(FakeTaskOutput())
            finally:
                if previous is None:
                    os.environ.pop("AGENT_OFFICE_EVENT_FILE", None)
                else:
                    os.environ["AGENT_OFFICE_EVENT_FILE"] = previous

            stored = json.loads(event_file.read_text(encoding="utf-8").strip())
            self.assertIn("três oportunidades", stored["text"])

    def test_persists_office_run_status(self):
        with tempfile.TemporaryDirectory() as directory:
            event_file = Path(directory) / "events.jsonl"
            event = publish_office_status(
                "running",
                "Agentes trabalhando",
                task="Criar uma proposta",
                event_file=event_file,
            )
            stored = json.loads(event_file.read_text(encoding="utf-8").strip())
            self.assertEqual(stored, event)
            self.assertEqual(stored["type"], "office_status")
            self.assertEqual(stored["status"], "running")


if __name__ == "__main__":
    unittest.main()

