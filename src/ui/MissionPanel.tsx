import { Panel } from "./Panel";

/** Painel de missão diária aberto ao interagir com o quadro. */
export function MissionPanel({ onClose }: { onClose(): void }) {
  return (
    <Panel title="Missão do dia" eyebrow="Quadro de missões" onClose={onClose} accent="#db8a3a">
      <div
        style={{
          padding: "16px 18px",
          borderRadius: 12,
          background: "rgba(219,138,58,0.1)",
          border: "1px solid rgba(219,138,58,0.3)",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: "#db8a3a", marginBottom: 6 }}>
          OBJETIVO DE HOJE
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
          Responder 10 questões de Arquivologia
        </div>
        <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.5 }}>
          Vá até o computador e complete uma sessão de estudo. Cada questão respondida
          corretamente conta para a meta do dia.
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, opacity: 0.75, marginBottom: 16 }}>
        <div
          style={{
            flex: 1,
            height: 8,
            borderRadius: 4,
            background: "rgba(255,255,255,0.08)",
            overflow: "hidden",
          }}
        >
          <div style={{ width: "0%", height: "100%", background: "#db8a3a" }} />
        </div>
        <span>0 / 10</span>
      </div>

      <button
        onClick={onClose}
        style={{
          padding: "9px 16px",
          borderRadius: 8,
          border: "none",
          background: "#db8a3a",
          color: "#241505",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        Voltar ao jogo
      </button>
    </Panel>
  );
}
