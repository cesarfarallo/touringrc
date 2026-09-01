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
        top: 24,
        right: -62,
        transform: "rotate(45deg)",
        background: "#E8391C",
        color: "#fff",
        fontFamily: "JetBrains Mono, monospace",
        fontWeight: 700,
        fontSize: 16,
        letterSpacing: 3,
        padding: "7px 72px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      DEV
    </div>
  );
}
