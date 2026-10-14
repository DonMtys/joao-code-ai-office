interface Props {
  text: string;
}

/** Aviso flutuante mostrado quando o jogador está perto de um objeto interativo. */
export function InteractionPrompt({ text }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: "18%",
        transform: "translateX(-50%)",
        padding: "10px 18px",
        borderRadius: 999,
        background: "rgba(18, 22, 30, 0.82)",
        border: "1px solid rgba(255,255,255,0.25)",
        color: "#f2f4f8",
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
        fontWeight: 600,
        userSelect: "none",
        pointerEvents: "none",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        zIndex: 10,
      }}
    >
      <span
        style={{
          display: "inline-block",
          minWidth: 24,
          padding: "3px 7px",
          borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.4)",
          background: "rgba(255,255,255,0.15)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        E
      </span>
      {text.replace(/^Pressione E para\s*/i, "")}
    </div>
  );
}
