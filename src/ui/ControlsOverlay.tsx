interface Props {
  onReset(): void;
}

const key: React.CSSProperties = {
  display: "inline-block",
  minWidth: 22,
  padding: "3px 7px",
  marginRight: 6,
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.35)",
  background: "rgba(255,255,255,0.12)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  textAlign: "center",
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  marginTop: 8,
};

/** Camada de interface sobre o jogo: controles + reiniciar. */
export function ControlsOverlay({ onReset }: Props) {
  return (
    <>
      {/* Painel de controles */}
      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          padding: "14px 16px",
          borderRadius: 12,
          background: "rgba(18, 22, 30, 0.72)",
          color: "#f2f4f8",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
          lineHeight: 1.2,
          userSelect: "none",
          backdropFilter: "blur(4px)",
        }}
      >
        <div style={{ fontWeight: 700, letterSpacing: 0.4, fontSize: 12, opacity: 0.75 }}>
          CONTROLES
        </div>
        <div style={row}>
          <span style={key}>W</span>
          <span style={key}>A</span>
          <span style={key}>S</span>
          <span style={key}>D</span>
          <span>mover</span>
        </div>
        <div style={row}>
          <span style={{ ...key, minWidth: 46 }}>Shift</span>
          <span>correr</span>
        </div>
        <div style={row}>
          <span style={key}>E</span>
          <span>interagir</span>
        </div>
        <div style={row}>
          <span style={{ ...key, minWidth: 46 }}>Mouse</span>
          <span>girar câmera</span>
        </div>
        <div style={row}>
          <span style={{ ...key, minWidth: 46 }}>Clique</span>
          <span>capturar mouse</span>
        </div>
        <div style={row}>
          <span style={{ ...key, minWidth: 46 }}>Esc</span>
          <span>liberar mouse</span>
        </div>
      </div>

      {/* Botão de reiniciar posição */}
      <button
        onClick={onReset}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          padding: "10px 16px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.25)",
          background: "rgba(18, 22, 30, 0.72)",
          color: "#f2f4f8",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          backdropFilter: "blur(4px)",
        }}
      >
        Reiniciar posição
      </button>
    </>
  );
}
