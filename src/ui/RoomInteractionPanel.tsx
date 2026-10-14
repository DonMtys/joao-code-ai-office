import { useState } from "react";
import { Panel } from "./Panel";

interface SubjectData {
  title: string;
  category: string;
  desc: string;
  accent: string;
  isExam?: boolean;
}

const SUBJECT_DETAILS: Record<string, SubjectData> = {
  "sala-portugues": {
    title: "Língua Portuguesa",
    category: "Sala de Aula · Português",
    desc: "Aulas teóricas e práticas focadas em gramática, interpretação de texto, sintaxe, regência e redação para concursos públicos.",
    accent: "#3b82f6",
  },
  "sala-assistencia_social": {
    title: "Assistência Social",
    category: "Sala de Aula · Assistência Social",
    desc: "Estudo aprofundado da Lei Orgânica da Assistência Social (LOAS), do Estatuto da Criança e do Adolescente (ECA) e diretrizes do SUAS.",
    accent: "#e28a3a",
  },
  "sala-direito_adm": {
    title: "Direito Administrativo",
    category: "Sala de Aula · Direito Administrativo",
    desc: "Tópicos essenciais de atos administrativos, poderes da administração, licitações da Lei 14.133/21, contratos públicos e agentes públicos.",
    accent: "#a855f7",
  },
  "sala-direito_const": {
    title: "Direito Constitucional",
    category: "Sala de Aula · Direito Constitucional",
    desc: "Estudo completo dos direitos fundamentais, garantias constitucionais, organização político-administrativa do Estado e dos Poderes na CF/88.",
    accent: "#10b981",
  },
  "sala-gestao_mat": {
    title: "Gestão de Materiais",
    category: "Sala de Aula · Gestão de Materiais",
    desc: "Conceitos de logística integrada, administração de recursos materiais, compras públicas, gestão de estoques e tombamento patrimonial.",
    accent: "#6b7280",
  },
  "sala-simulado": {
    title: "Arena de Simulados",
    category: "Arena · Provas Completas",
    desc: "Prepare-se para o dia da prova resolvendo simulados completos cronometrados com questões aleatórias das principais bancas de concursos.",
    accent: "#00f0ff",
    isExam: true,
  },
};

export function RoomInteractionPanel({
  onClose,
  subjectId,
}: {
  onClose(): void;
  subjectId: string;
}) {
  const [started, setStarted] = useState(false);
  const data = SUBJECT_DETAILS[subjectId] || {
    title: "Matéria Desconhecida",
    category: "Estudos",
    desc: "Área de estudos para concursos.",
    accent: "#3b82f6",
  };

  return (
    <Panel
      title={data.title}
      eyebrow={data.category}
      onClose={onClose}
      accent={data.accent}
    >
      <div style={{ fontFamily: "system-ui, sans-serif", color: "#f2f4f8" }}>
        {!started ? (
          // Tela de apresentação da Matéria
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                padding: "16px 18px",
                borderRadius: 12,
                background: `${data.accent}14`,
                border: `1px solid ${data.accent}30`,
                fontSize: 14,
                lineHeight: 1.55,
                opacity: 0.9,
              }}
            >
              {data.desc}
            </div>

            <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.4 }}>
              Ao iniciar a sessão de estudos, você ganhará XP acumulativo para o seu perfil e avançará nos seus objetivos diários.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
              <button
                onClick={onClose}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "none",
                  color: "#f2f4f8",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Voltar ao prédio
              </button>

              <button
                onClick={() => setStarted(true)}
                style={{
                  padding: "10px 22px",
                  borderRadius: 8,
                  border: "none",
                  background: data.accent,
                  color: data.isExam ? "#020813" : "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  boxShadow: `0 4px 14px ${data.accent}40`,
                }}
              >
                {data.isExam ? "Iniciar simulado" : "Começar estudo"}
              </button>
            </div>
          </div>
        ) : (
          // Micro-animação simulando estudo iniciado / ganho de XP
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "20px 0" }}>
            {/* Ícone de sucesso / XP */}
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: `${data.accent}20`,
                border: `2px solid ${data.accent}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                fontWeight: 700,
                color: data.accent,
                boxShadow: `0 0 20px ${data.accent}30`,
              }}
            >
              +50 XP
            </div>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
                {data.isExam ? "Simulado Iniciado!" : "Sessão de Estudo Iniciada!"}
              </div>
              <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.4 }}>
                {data.isExam
                  ? "As questões da prova foram carregadas. Boa sorte!"
                  : "Parabéns por dedicar um tempo aos seus estudos hoje!"}
              </div>
            </div>

            {/* Barra de progresso animando carregamento sutil */}
            <div
              style={{
                width: "80%",
                height: 6,
                background: "rgba(255,255,255,0.08)",
                borderRadius: 3,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: data.accent,
                  borderRadius: 3,
                  width: "100%",
                  animation: "study-progress 1.5s ease-out forwards",
                }}
              />
            </div>

            <button
              onClick={onClose}
              style={{
                marginTop: 8,
                padding: "10px 24px",
                borderRadius: 8,
                border: "none",
                background: data.accent,
                color: data.isExam ? "#020813" : "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                boxShadow: `0 4px 12px ${data.accent}30`,
              }}
            >
              Concluir e voltar ao prédio
            </button>
          </div>
        )}
      </div>

      {/* Adiciona estilo de animação da barra de progresso */}
      <style>{`
        @keyframes study-progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </Panel>
  );
}
