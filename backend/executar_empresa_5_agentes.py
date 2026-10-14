import os
import sys
import time
from dotenv import load_dotenv
from crewai import Agent, Task, Crew, Process, LLM as CrewAILLM

from ai_gateway import build_crewai_llm, credentials_available, resolve_model

# Garante que o diretório local esteja no sys.path para importações robustas
DIR_LOCAL = os.path.dirname(os.path.abspath(__file__))
if DIR_LOCAL not in sys.path:
    sys.path.insert(0, DIR_LOCAL)

from templates_segmentos import obter_template, criar_configuracao_personalizada
from agent_office_events import build_handoff_callback

# Configura UTF-8 no terminal Windows
if sys.platform == "win32" and sys.stdout is not None and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

load_dotenv()

def rodar_empresa_5_agentes(
    tarefa_usuario=None,
    api_key=None,
    output_dir=None,
    segmento="Comercial",
    dados_empresa=None
):
    print("=" * 75)
    print("🏢 PLATAFORMA GENÉRICA DE AUTOMAÇÃO EMPRESARIAL COM 5 AGENTES DE IA")
    print("=" * 75)

    gemini_key = api_key or os.getenv("GEMINI_API_KEY")
    model_name = os.getenv("GEMINI_MODEL_NAME", "gemini/gemini-3.5-flash-lite")
    selected_model = resolve_model(fallback_model=model_name).model

    # Confirmação segura sem imprimir a credencial.
    if gemini_key == "sua_chave_gemini_aqui":
        gemini_key = None
    if not credentials_available(
        selected_model,
        api_key=gemini_key,
        credential_model=model_name,
    ):
        print("❌ ERRO: chave do provedor selecionado não configurada no .env.")
        return None

    print("✅ CHAVE DO PROVEDOR: CONFIGURADA")
    print(f"🤖 MODELO INICIAL SELECIONADO: {selected_model}")
    print("🔒 CONTROLES DE SEGURANÇA: 1 Única rodada | max_iter=1 por agente | Execução sob demanda")

    # Resolução do template e perfil corporativo
    if dados_empresa:
        cfg = criar_configuracao_personalizada(
            ramo=dados_empresa.get("ramo", ""),
            objetivo=dados_empresa.get("objetivo", ""),
            publico_alvo=dados_empresa.get("publico_alvo", ""),
            localizacao=dados_empresa.get("localizacao", ""),
            tipo_pesquisa=dados_empresa.get("tipo_pesquisa", ""),
            tipo_tarefa=dados_empresa.get("tipo_tarefa", ""),
            criterios_analise=dados_empresa.get("criterios_analise", ""),
            template_base=segmento or "Comercial"
        )
    else:
        cfg = obter_template(segmento or "Comercial")

    ramo = cfg.get("ramo_padrao", "Empresarial Geral")
    objetivo = cfg.get("objetivo_padrao", "Otimizar processos e tração de negócios")
    publico = cfg.get("publico_alvo_padrao", "Tomadores de decisão")
    localizacao = cfg.get("localizacao_padrao", "Nacional")
    criterios = cfg.get("criterios_analise_padrao", "Viabilidade, retorno sobre investimento e conformidade")

    print(f"📌 SEGMENTO ATIVO: {cfg.get('nome', segmento)}")
    print(f"🎯 RAMO: {ramo} | OBJETIVO: {objetivo[:60]}...")

    llm = build_crewai_llm(
        fallback_model=model_name,
        api_key=gemini_key,
        credential_model=model_name,
        llm_factory=CrewAILLM,
    )

    # ---------------------------------------------------------
    # DEFINIÇÃO DOS 5 AGENTES GENÉRICOS (max_iter=1)
    # ---------------------------------------------------------

    pesquisador = Agent(
        role="Agente Pesquisador (Pesquisador de Mercado e Inteligência)",
        goal=f"Mapear oportunidades, concorrentes e dados de inteligência para o ramo '{ramo}'.",
        backstory=(
            f"Especialista em inteligência de mercado e pesquisa setorial para o ramo de {ramo}. "
            "Capaz de coletar dados públicos, mapear gargalos e identificar tendências sem inventar dados."
        ),
        llm=llm,
        max_iter=1,
        verbose=not bool(tarefa_usuario)
    )

    analista = Agent(
        role="Agente Analista (Estrategista e Marketing de Soluções)",
        goal=f"Analisar dados de mercado e desenhar estratégia de posicionamento e comunicação para '{ramo}'.",
        backstory=(
            f"Analista sênior de negócios e estratégias corporativas focado em {ramo}. "
            f"Transforma diagnósticos em planos de ação de alto impacto para o público '{publico}'."
        ),
        llm=llm,
        max_iter=1,
        verbose=not bool(tarefa_usuario)
    )

    comercial = Agent(
        role="Agente Comercial (Especialista em Vendas B2B e Negócios)",
        goal=f"Elaborar propostas comerciais de alto valor e cadência de prospecção para o objetivo '{objetivo}'.",
        backstory=(
            f"Especialista em fechamento de negócios e relacionamento corporativo no setor de {ramo}. "
            "Cria propostas claras, precificação justa e roteiros de abordagem de alta conversão."
        ),
        llm=llm,
        max_iter=1,
        verbose=not bool(tarefa_usuario)
    )

    executor = Agent(
        role="Agente Executor (Operações, Atendimento e Suporte)",
        goal=f"Mapear fluxos operacionais, procedimentos de entrega, FAQ e onboarding pós-conversão para '{ramo}'.",
        backstory=(
            f"Gerente de operações e sucesso do cliente no segmento {ramo}. "
            "Cria manuais práticos, roteiros de atendimento e mitiga objeções operacionais."
        ),
        llm=llm,
        max_iter=1,
        verbose=not bool(tarefa_usuario)
    )

    supervisor = Agent(
        role="Agente Supervisor (Gestor e Diretor de Operações)",
        goal="Consolidar as entregas de Pesquisa, Análise, Comercial e Operações no Plano Diretor Executivo.",
        backstory=(
            "Diretor de operações (COO) focado em eficiência empresarial, governança corporativa, "
            "alinhamento entre departamentos e aprovações humanas em decisões sensíveis."
        ),
        llm=llm,
        max_iter=1,
        verbose=not bool(tarefa_usuario)
    )

    # ---------------------------------------------------------
    # TAREFAS COM REPASSE SEQUENCIAL DE CONTEXTO
    # ---------------------------------------------------------

    f_pesquisa = "01_pesquisa_mercado.txt"
    f_marketing = "02_estrategia_marketing.txt"
    f_vendas = "03_proposta_vendas.txt"
    f_suporte = "04_manual_suporte.txt"
    f_gestor = "05_relatorio_gestor.txt"

    task1 = Task(
        description=(
            f"MISSÃO DE INTELIGÊNCIA SETORIAL:\n"
            f"Ramo: {ramo}\n"
            f"Objetivo: {objetivo}\n"
            f"Público-alvo: {publico}\n"
            f"Localização: {localizacao}\n"
            f"Mapeie oportunidades e dores de 3 nichos ou categorias do setor. "
            f"Descreva detalhadamente os gargalos identificados e os critérios: {criterios}."
        ),
        expected_output="Relatório detalhado de inteligência setorial com análise de oportunidades e limitações.",
        agent=pesquisador,
        output_file=f_pesquisa
    )

    task2 = Task(
        description=(
            f"Com base na inteligência coletada ({f_pesquisa}):\n"
            f"1. Desenvolva o plano de posicionamento e comunicação para o ramo '{ramo}'.\n"
            f"2. Crie 3 abordagens de comunicação completas voltadas ao público '{publico}'.\n"
            f"3. Destaque os diferenciais competitivos da solução."
        ),
        expected_output="Estratégia completa de análise e posicionamento alinhada ao diagnóstico.",
        agent=analista,
        output_file=f_marketing
    )

    task3 = Task(
        description=(
            f"Com base na inteligência ({f_pesquisa}) e estratégia ({f_marketing}):\n"
            f"1. Estruture a Proposta Comercial padrão para o objetivo: {objetivo}.\n"
            f"2. Defina os pacotes de precificação (Piloto vs Fornecimento Recorrente/Contrato).\n"
            f"3. Crie a cadência de prospecção comercial e abordagem direta."
        ),
        expected_output="Proposta comercial estruturada, tabela de precificação e roteiro de vendas.",
        agent=comercial,
        output_file=f_vendas
    )

    task4 = Task(
        description=(
            f"Com base na estratégia ({f_marketing}) e proposta comercial ({f_vendas}):\n"
            f"1. Elabore o FAQ de Operações com as 5 principais dúvidas e objeções técnicas do cliente.\n"
            f"2. Crie o Manual Operacional de Atendimento, Prazos de Entrega e Suporte Pós-Venda."
        ),
        expected_output="FAQ de operações, matriz de mitigação de objeções e manual de atendimento.",
        agent=executor,
        output_file=f_suporte
    )

    task5 = Task(
        description=(
            f"MISSÃO FINAL DO SUPERVISOR:\n"
            f"Examine e consolide o trabalho dos 4 agentes ({f_pesquisa}, {f_marketing}, {f_vendas}, {f_suporte}).\n"
            f"Crie o Plano Diretor Executivo Mestre para o ramo '{ramo}', integrando todos os departamentos "
            "e destacando pontos que exigem aprovação humana."
        ),
        expected_output="Plano Diretor Executivo Master integrando a operação completa dos 5 departamentos.",
        agent=supervisor,
        output_file=f_gestor
    )

    # ---------------------------------------------------------
    # ADAPTAÇÃO DINÂMICA CASO SEJA FORNECIDA TAREFA ESPECÍFICA
    # ---------------------------------------------------------

    if tarefa_usuario is not None:
        briefing = tarefa_usuario.strip()
        if not briefing:
            raise ValueError("Digite uma tarefa antes de executar.")

        pesquisador.goal = f"Pesquisar fatos, contexto e restrições relevantes para a tarefa: '{briefing[:80]}'."
        analista.goal = f"Analisar dados e criar estratégia de comunicação para a tarefa: '{briefing[:80]}'."
        comercial.goal = f"Transformar as análises em proposta e próximos passos comerciais para a tarefa: '{briefing[:80]}'."
        executor.goal = f"Preparar manual operacional, respostas e procedimentos para a tarefa: '{briefing[:80]}'."
        supervisor.goal = f"Consolidar as entregas dos 4 agentes em um plano executivo integrado para a tarefa: '{briefing[:80]}'."

        task1.description = (
            f"TAREFA DO USUÁRIO: {briefing}\n"
            f"Contexto do Segmento: {ramo}\n"
            "Pesquise o contexto, identifique hipóteses e separe fatos de suposições. "
            "Não afirme ter feito pesquisa externa se não houver ferramenta de navegação."
        )
        task1.expected_output = "Pesquisa inicial com contexto, hipóteses e fontes ou limitações."

        task2.description = (
            f"TAREFA DO USUÁRIO: {briefing}\n"
            "Use o trabalho do Pesquisador para propor estratégia e análise. "
            "Indique claramente o que depende de validação."
        )
        task2.expected_output = "Estratégia de marketing alinhada à pesquisa."

        task3.description = (
            f"TAREFA DO USUÁRIO: {briefing}\n"
            "Use pesquisa e marketing para criar uma proposta comercial prática, "
            "com objeções e próximos passos. Não invente preços confirmados."
        )
        task3.expected_output = "Proposta comercial com premissas explícitas."

        task4.description = (
            f"TAREFA DO USUÁRIO: {briefing}\n"
            "Use a pesquisa, estratégia e proposta para preparar FAQ e orientação de suporte."
        )
        task4.expected_output = "FAQ e orientações de atendimento."

        task5.description = (
            f"TAREFA DO USUÁRIO: {briefing}\n"
            "Consolide as quatro entregas anteriores em uma resposta final objetiva, "
            "com plano de ação, pontos de atenção e decisões que exigem aprovação humana."
        )
        task5.expected_output = "Resposta final integrada dos cinco agentes."

    # Cada callback observa uma entrega real do fluxo sequencial. Ele não chama
    # outro modelo: apenas registra o repasse que o próximo agente já receberá.
    task1.callback = build_handoff_callback("pesquisador", "analista", "Pesquisa concluída")
    task2.callback = build_handoff_callback("analista", "comercial", "Estratégia pronta")
    task3.callback = build_handoff_callback("comercial", "executor", "Proposta pronta")
    task4.callback = build_handoff_callback("executor", "supervisor", "Operação validada")

    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        for task in (task1, task2, task3, task4, task5):
            task.output_file = os.path.join(output_dir, os.path.basename(task.output_file))

    empresa_crew = Crew(
        agents=[pesquisador, analista, comercial, executor, supervisor],
        tasks=[task1, task2, task3, task4, task5],
        process=Process.sequential,
        verbose=not bool(tarefa_usuario)
    )

    inicio = time.time()
    print("\n🚀 Iniciando rodada de execução dos 5 agentes corporativos...\n")
    try:
        resultado = empresa_crew.kickoff()
        tempo_total = time.time() - inicio

        print("\n" + "=" * 75)
        print("🎉 EXECUÇÃO DOS 5 AGENTES CONCLUÍDA COM SUCESSO!")
        print(f"⏱️ Tempo Total de Execução: {tempo_total:.2f} segundos")
        print("=" * 75)

        if hasattr(empresa_crew, 'usage_metrics') and empresa_crew.usage_metrics:
            print(f"📊 Métrica de Tokens (CrewAI Metrics): {empresa_crew.usage_metrics}")
        elif hasattr(resultado, 'token_usage'):
            print(f"📊 Consumo de Tokens: {resultado.token_usage}")

        return resultado
    except Exception as e:
        tempo_total = time.time() - inicio
        print(f"\n❌ ERRO DURANTE A EXECUÇÃO DA CREW ({tempo_total:.2f}s): {str(e)}")
        if tarefa_usuario is not None:
            raise
        return None

if __name__ == "__main__":
    rodar_empresa_5_agentes()
