import { Panel } from "./Panel";

const TOPICS = [
  {
    title: "Gestão de documentos",
    text: "Conjunto de procedimentos das fases de produção, tramitação, uso, avaliação e arquivamento, do documento corrente até sua destinação final (guarda permanente ou eliminação).",
  },
  {
    title: "Classificação e arranjo",
    text: "A classificação organiza os documentos correntes e intermediários pelo assunto (plano de classificação); o arranjo organiza os documentos de guarda permanente, respeitando a proveniência.",
  },
  {
    title: "Princípios arquivísticos",
    text: "Proveniência (respeito ao fundo), organicidade, unicidade, indivisibilidade e cumulatividade — a base teórica que orienta como um arquivo deve ser organizado e preservado.",
  },
];

/** Painel de resumos aberto ao interagir com a estante. */
export function LibraryPanel({ onClose }: { onClose(): void }) {
  return (
    <Panel title="Resumos rápidos" eyebrow="Estante · Arquivologia" onClose={onClose} accent="#4caf6b">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {TOPICS.map((t) => (
          <div
            key={t.title}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "rgba(76,175,107,0.08)",
              border: "1px solid rgba(76,175,107,0.25)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{t.title}</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.85 }}>{t.text}</div>
          </div>
        ))}
        <button
          onClick={onClose}
          style={{
            alignSelf: "flex-end",
            marginTop: 4,
            padding: "9px 16px",
            borderRadius: 8,
            border: "none",
            background: "#4caf6b",
            color: "#0d1f14",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Voltar ao jogo
        </button>
      </div>
    </Panel>
  );
}
