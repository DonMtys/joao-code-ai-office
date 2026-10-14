"""
Módulo de Templates de Segmento para a Plataforma de Automação Empresarial.
Permite adaptar o comportamento dos 5 agentes genéricos para qualquer ramo de atividade.
"""

from typing import Dict, Any

TEMPLATES_DISPONIVEIS: Dict[str, Dict[str, Any]] = {
    "Comercial": {
        "id": "comercial",
        "nome": "Comercial (B2B / Varejo / PMEs)",
        "ramo_padrao": "Comércio e Distribuição B2B",
        "objetivo_padrao": "Mapear empresas compradoras, identificar gargalos de fornecimento e gerar cadência de prospecção ativa.",
        "publico_alvo_padrao": "Diretores de compras, gerentes comerciais e donos de PMEs.",
        "localizacao_padrao": "Nacional / Regional",
        "tipo_pesquisa_padrao": "Pesquisa de fornecedores, preços e volume de demanda pública.",
        "tipo_tarefa_padrao": "Geração de propostas comerciais de alto valor e esteira de contato via WhatsApp/Email.",
        "criterios_analise_padrao": "Margem estimada, recorrência potencial, maturidade digital do cliente.",
        "agentes": {
            "pesquisador": {"foco": "Identificar oportunidades de compras e concorrentes diretos no setor."},
            "analista": {"foco": "Analisar ticket médio, viabilidade de margem e gargalos da concorrência."},
            "comercial": {"foco": "Estruturar proposta comercial de fornecimento e roteiro de negociação B2B."},
            "executor": {"foco": "Desenvolver materiais de apresentação e fluxo de atendimento rápido."},
            "supervisor": {"foco": "Consolidar o plano de tração comercial e mitigação de risco de crédito."}
        }
    },
    "Cobranca": {
        "id": "cobranca",
        "nome": "Cobrança & Recuperação de Ativos",
        "ramo_padrao": "Recuperação de Crédito e Cobrança Amigável",
        "objetivo_padrao": "Mapear carteiras inadimplentes, estruturar estratégias de acordo extrajudicial e régua de acionamento.",
        "publico_alvo_padrao": "Clientes em atraso (Pessoa Física e Jurídica), gerentes financeiros.",
        "localizacao_padrao": "Brasil",
        "tipo_pesquisa_padrao": "Pesquisa de canais de contato, conformidade jurídica (CDC) e faixas de atraso.",
        "tipo_tarefa_padrao": "Elaboração de réguas de cobrança humanizadas e scripts de negociação com desconto.",
        "criterios_analise_padrao": "Taxa de recuperação esperada, preservação do relacionamento com o cliente, conformidade regulatória.",
        "agentes": {
            "pesquisador": {"foco": "Mapear padrões de atraso e canais de contato mais eficazes."},
            "analista": {"foco": "Segmentar carteiras por faixa de risco e estimar probabilidade de liquidação."},
            "comercial": {"foco": "Criar propostas de parcelamento facilitado e condições de quitação."},
            "executor": {"foco": "Produzir roteiros de abordagem empática e perguntas frequentes (FAQ) de acordos."},
            "supervisor": {"foco": "Garantir conformidade ética e jurídica de toda a esteira de cobrança."}
        }
    },
    "Construcao": {
        "id": "construcao",
        "nome": "Construção Civil & Engenharia",
        "ramo_padrao": "Construção Civil, Reformas e Obras Corporativas",
        "objetivo_padrao": "Identificar novos empreendimentos, obras em planejamento e prospecção de subempreiteiras/fornecedores.",
        "publico_alvo_padrao": "Engenheiros chefes, construtoras, escritórios de arquitetura e incorporadoras.",
        "localizacao_padrao": "Capitais e polos de desenvolvimento",
        "tipo_pesquisa_padrao": "Levantamento de alvarás, portfólio de construtoras e fornecedores de insumos.",
        "tipo_tarefa_padrao": "Propostas técnicas de engenharia, cronograma físico-financeiro preliminar e orçamento.",
        "criterios_analise_padrao": "Prazo de execução, conformidade com normas técnicas, viabilidade orçamentária.",
        "agentes": {
            "pesquisador": {"foco": "Mapear obras ativas, licitações e empresas contratantes de engenharia."},
            "analista": {"foco": "Analisar custos de insumos, gargalos de mão de obra e prazos médios."},
            "comercial": {"foco": "Elaborar propostas técnicas para concorrências e orçamentos de serviços."},
            "executor": {"foco": "Gerar check-lists de execução de obra e procedimentos de segurança."},
            "supervisor": {"foco": "Auditar cronogramas, custos e plano diretor de engenharia."}
        }
    },
    "Saude": {
        "id": "saude",
        "nome": "Saúde & Clínicas Especializadas",
        "ramo_padrao": "Clínicas Médicas, Odontológicas e Estética",
        "objetivo_padrao": "Atrair pacientes particulares para tratamentos de alto valor e otimizar a experiência de atendimento.",
        "publico_alvo_padrao": "Pacientes locais, convênios premium e indicações médicas.",
        "localizacao_padrao": "Bairros centrais e regiões metropolitanas",
        "tipo_pesquisa_padrao": "Mapeamento da demanda por especialidades e presença digital de clínicas concorrentes.",
        "tipo_tarefa_padrao": "Fluxo de confirmação e resgate de consultas, campanhas informativas e pós-atendimento.",
        "criterios_analise_padrao": "Satisfação do paciente (NPS), taxa de retorno e conformidade com conselhos éticos (CFM/CFO).",
        "agentes": {
            "pesquisador": {"foco": "Pesquisar concorrentes de saúde e serviços mais demandados na região."},
            "analista": {"foco": "Avaliar cancelamentos, taxa de conversão de orçamentos e dores dos pacientes."},
            "comercial": {"foco": "Estruturar planos de tratamento e estratégias de fidelização de pacientes."},
            "executor": {"foco": "Criar manuais de boas-vindas, orientações pós-consulta e FAQs médicos seguros."},
            "supervisor": {"foco": "Assegurar comunicação ética e humanizada no padrão da clínica."}
        }
    },
    "Marketing": {
        "id": "marketing",
        "nome": "Marketing & Agências de Conteúdo",
        "ramo_padrao": "Agência de Marketing Digital, Performance e Vídeos",
        "objetivo_padrao": "Prospectar marcas e negócios locais que precisam modernizar sua presença digital e autoridade.",
        "publico_alvo_padrao": "Donos de pequenas e médias empresas, fundadores e gerentes de marketing.",
        "localizacao_padrao": "Nacional / Remoto",
        "tipo_pesquisa_padrao": "Auditoria de redes sociais de concorrentes, tráfego web e frequência de postagens.",
        "tipo_tarefa_padrao": "Planejamento editorial, campanhas de aquisição e roteirização de vídeos com IA.",
        "criterios_analise_padrao": "Taxa de engajamento, custo por lead (CPL) e potencial de LTV da conta.",
        "agentes": {
            "pesquisador": {"foco": "Identificar empresas com presença digital defasada e alto potencial de crescimento."},
            "analista": {"foco": "Diagnosticar falhas de conteúdo, identidade visual e conversão nas páginas do cliente."},
            "comercial": {"foco": "Criar proposta de pacote mensal de conteúdo e esteira de vendas B2B."},
            "executor": {"foco": "Redigir roteiros de conteúdo de alta conversão e calendário de publicações."},
            "supervisor": {"foco": "Coordenar o alinhamento de marca e garantia de entrega dos materiais."}
        }
    },
    "Imobiliario": {
        "id": "imobiliario",
        "nome": "Imobiliário (Template Opcional)",
        "ramo_padrao": "Gestão Comercial e Oportunidades do Setor Imobiliário",
        "objetivo_padrao": "Mapear anúncios com baixa atratividade visual e oferecer modernização de catálogo de oportunidades.",
        "publico_alvo_padrao": "Gestores de carteira e equipes de atendimento de oportunidades imobiliárias.",
        "localizacao_padrao": "Regiões metropolitanas",
        "tipo_pesquisa_padrao": "Auditoria de catálogos e presença de vídeos nas páginas públicas de ofertas.",
        "tipo_tarefa_padrao": "Geração de dossiê de modernização e proposta de otimização de catálogo.",
        "criterios_analise_padrao": "Volume de itens sem conteúdo dinâmico, ticket médio e velocidade de giro.",
        "agentes": {
            "pesquisador": {"foco": "Auditar itens cadastrados e identificar carência de multimídia."},
            "analista": {"foco": "Avaliar perda de atratividade em itens sem vídeo ou tour interativo."},
            "comercial": {"foco": "Montar proposta comercial para modernização do catálogo de itens."},
            "executor": {"foco": "Gerar roteiros e materiais de apresentação para as oportunidades."},
            "supervisor": {"foco": "Consolidar o plano diretor de modernização de catálogo."}
        }
    }
}


def obter_template(nome_template: str) -> Dict[str, Any]:
    """Retorna o template de segmento solicitado ou o Comercial por padrão."""
    return TEMPLATES_DISPONIVEIS.get(nome_template, TEMPLATES_DISPONIVEIS["Comercial"])


def criar_configuracao_personalizada(
    ramo: str,
    objetivo: str,
    publico_alvo: str,
    localizacao: str,
    tipo_pesquisa: str,
    tipo_tarefa: str,
    criterios_analise: str,
    template_base: str = "Comercial"
) -> Dict[str, Any]:
    """Cria uma configuração adaptada para qualquer segmento com os dados fornecidos pelo usuário."""
    base = obter_template(template_base).copy()
    base["ramo_padrao"] = ramo or base["ramo_padrao"]
    base["objetivo_padrao"] = objetivo or base["objetivo_padrao"]
    base["publico_alvo_padrao"] = publico_alvo or base["publico_alvo_padrao"]
    base["localizacao_padrao"] = localizacao or base["localizacao_padrao"]
    base["tipo_pesquisa_padrao"] = tipo_pesquisa or base["tipo_pesquisa_padrao"]
    base["tipo_tarefa_padrao"] = tipo_tarefa or base["tipo_tarefa_padrao"]
    base["criterios_analise_padrao"] = criterios_analise or base["criterios_analise_padrao"]
    return base
