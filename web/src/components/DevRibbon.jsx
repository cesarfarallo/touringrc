import { T } from "../theme";

// Franja diagonal para no confundir nunca el entorno de staging/desarrollo
// con producción. Se prende sola corriendo `npm run dev` local (Vite pone
// import.meta.env.DEV=true), o en Vercel si VITE_APP_ENV=staging está
// cargada como env var con target "Preview" (ver CLAUDE.md).
export default function DevRibbon() {
  const esDev = import.meta.env.DEV || import.meta.env.VITE_APP_ENV === "staging";
  if (!esDev) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 18,
        right: -46,
        transform: "rotate(45deg)",
        background: T.red,
        color: "#fff",
        fontFamily: "JetBrains Mono, monospace",
        fontWeight: 700,
        fontSize: 12,
        letterSpacing: 2,
        padding: "4px 50px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      DEV
    </div>
  );
}
