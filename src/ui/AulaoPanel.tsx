import { useState, useEffect } from "react";
import { Panel } from "./Panel";

const LECTURES = [
  {
    id: "arquivologia",
    title: "Aulão de Arquivologia",
    desc: "Revisão focada nos métodos de arquivamento, ciclo vital dos documentos e princípios fundamentais da disciplina.",
    duration: "45m",
  },
  {
    id: "portugues",
    title: "Aulão de Português",
    desc: "Principais pegadinhas de crase, regência verbal/nominal e concordância para gabaritar a sua prova.",
    duration: "50m",
  },
  {
    id: "assistencia_social",
    title: "Aulão de Assistência Social",
    desc: "Principais aspectos da LOAS, estatutos e diretrizes do SUS e SUAS atualizados para concursos.",
    duration: "40m",
  },
];

export function AulaoPanel({ onClose }: { onClose(): void }) {
  const [selected, setSelected] = useState<typeof LECTURES[number] | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  // Simula a barra de progresso avançando quando o vídeo está "tocando"
  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 0.5;
        });
      }, 200);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handlePlayToggle = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSelectLecture = (lec: typeof LECTURES[number]) => {
    setSelected(lec);
    setIsPlaying(false);
    setProgress(0);
  };

  const handleBackToList = () => {
    setSelected(null);
    setIsPlaying(false);
    setProgress(0);
  };

  return (
    <Panel
      title="Aulão Preparatório"
      eyebrow="Cinema · Vídeo Aulas"
      onClose={onClose}
      accent="#3b82f6"
    >
      <div style={{ fontFamily: "system-ui, sans-serif" }}>
        {!selected ? (
          // Lista de Aulas
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 4 }}>
              Selecione uma das aulas abaixo para reproduzir no telão do auditório:
            </div>
            {LECTURES.map((lec) => (
              <button
                key={lec.id}
                onClick={() => handleSelectLecture(lec)}
                style={{
                  textAlign: "left",
                  padding: "16px 18px",
                  borderRadius: 12,
                  border: "1px solid rgba(59, 130, 246, 0.2)",
                  background: "rgba(59, 130, 246, 0.05)",
                  color: "#f2f4f8",
                  cursor: "pointer",
                  transition: "all 0.2s ease-in-out",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(59, 130, 246, 0.12)";
                  e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(59, 130, 246, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.2)";
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: "#93c5fd" }}>
                    {lec.title}
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.4 }}>
                    {lec.desc}
                  </div>
                </div>
                <div
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.08)",
                    fontSize: 11,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    opacity: 0.8,
                  }}
                >
                  {lec.duration}
                </div>
              </button>
            ))}
            <button
              onClick={onClose}
              style={{
                alignSelf: "flex-end",
                marginTop: 6,
                padding: "10px 20px",
                borderRadius: 8,
                border: "none",
                background: "rgba(255, 255, 255, 0.08)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Voltar ao jogo
            </button>
          </div>
        ) : (
          // Reprodutor de Vídeo Simulado
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#93c5fd" }}>
                Reproduzindo: {selected.title}
              </div>
              <button
                onClick={handleBackToList}
                style={{
                  background: "none",
                  border: "none",
                  color: "#93c5fd",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                Mudar de aula
              </button>
            </div>

            {/* Tela Escura de Vídeo */}
            <div
              style={{
                position: "relative",
                width: "100%",
                paddingTop: "56.25%", // 16:9 Aspect Ratio
                background: "#080b11",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.1)",
                overflow: "hidden",
                boxShadow: "inset 0 0 40px rgba(0,0,0,0.8)",
              }}
            >
              {/* Conteúdo interno da tela de vídeo */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* Botão Big Play centralizado */}
                <button
                  onClick={handlePlayToggle}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: isPlaying ? "rgba(255,255,255,0.15)" : "#3b82f6",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                    transition: "transform 0.1s ease",
                  }}
                  onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
                  onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                >
                  {isPlaying ? (
                    // Ícone Pause
                    <div style={{ display: "flex", gap: 6 }}>
                      <div style={{ width: 6, height: 24, background: "#fff", borderRadius: 2 }} />
                      <div style={{ width: 6, height: 24, background: "#fff", borderRadius: 2 }} />
                    </div>
                  ) : (
                    // Ícone Play
                    <div
                      style={{
                        width: 0,
                        height: 0,
                        borderTop: "12px solid transparent",
                        borderBottom: "12px solid transparent",
                        borderLeft: "20px solid #fff",
                        marginLeft: 6,
                      }}
                    />
                  )}
                </button>

                <div style={{ fontSize: 13, opacity: 0.6, marginTop: 12 }}>
                  {isPlaying ? "Reproduzindo aula fictícia..." : "Clique para iniciar"}
                </div>

                {/* Controles de Mídia na parte inferior */}
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
                    padding: "12px 16px 8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {/* Barra de Progresso */}
                  <div
                    style={{
                      width: "100%",
                      height: 4,
                      background: "rgba(255,255,255,0.2)",
                      borderRadius: 2,
                      cursor: "pointer",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        width: `${progress}%`,
                        height: "100%",
                        background: "#3b82f6",
                        borderRadius: 2,
                        position: "absolute",
                        left: 0,
                        top: 0,
                      }}
                    />
                  </div>

                  {/* Detalhes de Rodapé */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 11,
                      opacity: 0.8,
                    }}
                  >
                    <div>
                      {isPlaying ? `00:${Math.floor(progress * 0.27).toString().padStart(2, "0")}` : "00:00"} / {selected.duration}
                    </div>
                    <div>HD 🔊 ⚙ 🛈</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ações */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <button
                onClick={handleBackToList}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "none",
                  color: "#f2f4f8",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Voltar à lista
              </button>

              <button
                onClick={onClose}
                style={{
                  padding: "10px 22px",
                  borderRadius: 8,
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
                }}
              >
                Voltar ao cinema
              </button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
