import { T } from "../theme";

export default function NavTab({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        borderRadius: 8,
        border: "none",
        background: active ? T.surfaceRaised : "transparent",
        color: active ? T.amber : T.muted,
        fontFamily: "Inter, sans-serif",
        fontWeight: 600,
        fontSize: 14,
        cursor: "pointer",
        transition: "all 0.2s",
      }}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}
