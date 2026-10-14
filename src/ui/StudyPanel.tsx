import { useState } from "react";
import { Panel } from "./Panel";

/**
 * Painel de estudo aberto ao interagir com o computador.
 * Uma questão fictícia de Arquivologia com correção e explicação.
 */

const QUESTION = {
  prompt: "No método numérico, é necessário utilizar um índice?",
  options: ["A) Sim", "B) Não"] as const,
  correct: 0,
  explanation: "O método numérico é indireto porque necessita de índice.",
};

export function StudyPanel({ onClose }: { onClose(): void }) {
  const [answer, setAnswer] = useState<number | null>(null);

  const answered = answer !== null;
  const isCorrect = answer === QUESTION.correct;

  return (
    <Panel
      title="Questão de Arquivologia"
      eyebrow="Computador · Sessão de estudo"
      onClose={onClose}
      accent="#3B6FB3"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5 }}>{QUESTION.prompt}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {QUESTION.options.map((opt, i) => {
            const selected = answer === i;
            const showCorrect = answered && i === QUESTION.correct;
            const showWrong = answered && selected && i !== QUESTION.correct;
            return (
              <button
                key={opt}
                onClick={() => !answered && setAnswer(i)}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid",
                  borderColor: showCorrect
                    ? "#4caf6b"
                    : showWrong
                    ? "#d3564f"
                    : selected
                    ? "#3B6FB3"
                    : "rgba(255,255,255,0.14)",
                  background: showCorrect
                    ? "rgba(76,175,107,0.16)"
                    : showWrong
                    ? "rgba(211,86,79,0.16)"
                    : "rgba(255,255,255,0.04)",
                  color: "#f2f4f8",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: answered ? "default" : "pointer",
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {answered && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: isCorrect ? "rgba(76,175,107,0.12)" : "rgba(211,86,79,0.12)",
              border: `1px solid ${isCorrect ? "rgba(76,175,107,0.35)" : "rgba(211,86,79,0.35)"}`,
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {isCorrect ? "✓ Resposta correta!" : "✗ Resposta incorreta. A correta é a alternativa A."}
            </div>
            <div style={{ opacity: 0.85 }}>{QUESTION.explanation}</div>
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            alignSelf: "flex-end",
            marginTop: 4,
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: "#3B6FB3",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Voltar para a sala
        </button>
      </div>
    </Panel>
  );
}
