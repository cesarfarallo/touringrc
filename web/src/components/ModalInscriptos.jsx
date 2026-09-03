import { X } from "lucide-react";
import { T } from "../theme";

// Popup público con el listado de inscriptos agrupado por categoría --
// requiere la policy de lectura pública de la migración 0016 (antes de
// eso, `inscripciones` solo era legible por el propio piloto o un admin).
export default function ModalInscriptos({ evento, cargando, porClase, error, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.surface,
          border: `1px solid ${T.line}`,
          borderRadius: 12,
          padding: 24,
          maxWidth: 420,
          width: "100%",
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 }}>
          <div>
            <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 20, fontWeight: 600 }}>Inscriptos</div>
            <div style={{ color: T.muted, fontSize: 13, marginTop: 2 }}>{evento?.nombre}</div>
          </div>
          <button
            onClick={onClose}
            title="Cerrar"
            style={{ display: "flex", background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 4, flexShrink: 0 }}
          >
            <X size={18} />
          </button>
        </div>

        {cargando && <div style={{ color: T.muted, fontSize: 13 }}>Cargando...</div>}
        {error && <div style={{ color: T.red, fontSize: 13 }}>{error}</div>}
        {!cargando && !error && Object.keys(porClase ?? {}).length === 0 && (
          <div style={{ color: T.muted, fontSize: 13 }}>Todavía no hay inscriptos en esta fecha.</div>
        )}
        {!cargando &&
          !error &&
          Object.entries(porClase ?? {}).map(([clase, nombres]) => (
            <div key={clase} style={{ marginBottom: 16 }}>
              <div style={{ color: T.amber, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                {clase} ({nombres.length})
              </div>
              <ol style={{ margin: 0, paddingLeft: 20, color: T.text, fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                {nombres.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ol>
            </div>
          ))}
      </div>
    </div>
  );
}
