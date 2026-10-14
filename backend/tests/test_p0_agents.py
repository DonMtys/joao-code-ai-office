"""Testes locais da montagem de agentes; sem rede nem chave real."""
import importlib.util
import io
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from contextlib import redirect_stdout
from unittest import mock


PROJECT = Path(__file__).resolve().parents[1]


class FakeLLM:
    def __init__(self, **kwargs):
        self.options = kwargs


class FakeAgent:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class FakeTask:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class FakeCrew:
    last = None

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.kickoff_count = 0
        FakeCrew.last = self

    def kickoff(self):
        self.kickoff_count += 1
        return "resultado-local-falso"


class FakeProcess:
    sequential = object()


def import_main():
    crewai = types.ModuleType("crewai")
    crewai.Agent = FakeAgent
    crewai.Task = FakeTask
    crewai.Crew = FakeCrew
    crewai.Process = FakeProcess
    crewai.LLM = FakeLLM
    dotenv = types.ModuleType("dotenv")
    dotenv.load_dotenv = lambda *args, **kwargs: None
    module_path = PROJECT / "executar_empresa_5_agentes.py"
    spec = importlib.util.spec_from_file_location("p0_five_agents", module_path)
    module = importlib.util.module_from_spec(spec)
    with mock.patch.dict(sys.modules, {"crewai": crewai, "dotenv": dotenv}):
        spec.loader.exec_module(module)
    return module


class FiveAgentTests(unittest.TestCase):
    def setUp(self):
        FakeCrew.last = None

    def test_five_agents_and_sequential_orchestration(self):
        module = import_main()
        with mock.patch.dict(os.environ, {
            "GEMINI_API_KEY": "test-only-placeholder",
            "GEMINI_MODEL_NAME": "gemini/test-local",
        }):
            with redirect_stdout(io.StringIO()):
                result = module.rodar_empresa_5_agentes()

        self.assertEqual(result, "resultado-local-falso")
        crew = FakeCrew.last
        self.assertIsNotNone(crew)
        self.assertEqual(crew.process, FakeProcess.sequential)
        self.assertEqual(crew.kickoff_count, 1)
        self.assertEqual(len(crew.agents), 5)
        self.assertEqual(len(crew.tasks), 5)
        expected = ["Pesquisador", "Marketing", "Vendas", "Suporte", "Gestor"]
        for word, agent, task in zip(expected, crew.agents, crew.tasks):
            self.assertIn(word, agent.role)
            self.assertIs(task.agent, agent)
            self.assertEqual(agent.max_iter, 1)
            self.assertIs(agent.llm, crew.agents[0].llm)
        self.assertEqual(
            [task.output_file for task in crew.tasks],
            [
                "01_pesquisa_mercado.txt",
                "02_estrategia_marketing.txt",
                "03_proposta_vendas.txt",
                "04_manual_suporte.txt",
                "05_relatorio_gestor.txt",
            ],
        )
        self.assertEqual(crew.agents[0].llm.options["model"], "gemini/test-local")

    def test_custom_task_uses_supplied_key_and_separate_outputs(self):
        module = import_main()
        with tempfile.TemporaryDirectory() as folder:
            with mock.patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
                with redirect_stdout(io.StringIO()):
                    result = module.rodar_empresa_5_agentes(
                        tarefa_usuario="Criar proposta para uma imobiliária",
                        api_key="test-only-placeholder",
                        output_dir=folder,
                    )
            crew = FakeCrew.last
            self.assertEqual(result, "resultado-local-falso")
            self.assertEqual(crew.kickoff_count, 1)
            self.assertIn("Criar proposta para uma imobiliária", crew.tasks[0].description)
            self.assertTrue(all(task.output_file.startswith(folder) for task in crew.tasks))
            self.assertEqual(crew.agents[0].llm.options["api_key"], "test-only-placeholder")
    def test_missing_key_stops_before_creating_crew(self):
        module = import_main()
        with mock.patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            with redirect_stdout(io.StringIO()):
                result = module.rodar_empresa_5_agentes()
        self.assertIsNone(result)
        self.assertIsNone(FakeCrew.last)


if __name__ == "__main__":
    unittest.main()
