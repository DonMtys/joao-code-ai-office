import type { ReactNode } from "react";

interface Props {
  title: string;
  eyebrow: string;
  onClose(): void;
  children: ReactNode;
  accent?: string;
}

/**
 * Moldura comum a todos os painéis que aparecem sobre a cena 3D
 * (computador, estante, quadro de missões).
 */
export function Panel({ title, eyebrow, onClose, children, accent = "#3B6FB3" }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10, 12, 16, 0.55)",
        backdropFilter: "blur(2px)",
        zIndex: 20,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 92vw)",
          maxHeight: "84vh",
          overflowY: "auto",
          background: "#181c24",
          color: "#f2f4f8",
          borderRadius: 16,
          border: `1px solid ${accent}55`,
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            padding: "18px 22px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: accent,
                marginBottom: 4,
              }}
            >
              {eyebrow}
            </div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{title}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{
              border: "none",
              background: "rgba(255,255,255,0.08)",
              color: "#f2f4f8",
              width: 30,
              height: 30,
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: "30px",
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: "18px 22px 22px" }}>{children}</div>
      </div>
    </div>
  );
}
