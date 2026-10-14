"""Executa uma missão real dos cinco agentes iniciada pelo escritório 3D."""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

from agent_office_events import publish_office_status
from executar_empresa_5_agentes import rodar_empresa_5_agentes


def main() -> int:
    objective = " ".join(" ".join(sys.argv[1:]).split())
    if len(objective) < 3 or len(objective) > 2000:
        publish_office_status("error", "A missão precisa ter entre 3 e 2.000 caracteres.")
        return 2

    run_directory = (
        Path(__file__).resolve().parent
        / "storage"
        / "agent_office_runs"
        / datetime.now().strftime("%Y%m%d-%H%M%S")
    )
    publish_office_status("running", "Os cinco agentes começaram a missão.", task=objective)
    try:
        result = rodar_empresa_5_agentes(
            tarefa_usuario=objective,
            output_dir=str(run_directory),
        )
        if result is None:
            publish_office_status(
                "error",
                "A execução não iniciou. Verifique o modelo e a credencial no .env.",
                task=objective,
            )
            return 1
        publish_office_status(
            "completed",
            "Missão concluída pelos cinco agentes.",
            task=objective,
        )
        return 0
    except Exception as error:
        publish_office_status(
            "error",
            f"A missão falhou: {type(error).__name__}.",
            task=objective,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

