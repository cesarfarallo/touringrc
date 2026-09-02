import { ChevronRight } from "lucide-react";
import { T } from "../theme";

export default function EventoCard({ evento, onVerResultados }) {
  const fecha = new Date(evento.fecha + "T00:00:00");
  const fechaStr = fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderRadius: 12,
        padding: 20,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 20, fontWeight: 600, letterSpacing: 0.3 }}>
          {evento.nombre}
        </div>
        <div style={{ color: T.muted, fontSize: 13, marginTop: 4, fontFamily: "Inter, sans-serif" }}>{fechaStr}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {evento.corrida ? (
          <button
            onClick={() => onVerResultados(evento.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${T.line}`,
              background: "transparent",
              color: T.text,
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Ver resultados <ChevronRight size={14} />
          </button>
        ) : (
          <button
            disabled={!evento.inscripcion_habilitada}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: evento.inscripcion_habilitada ? T.amber : T.surfaceRaised,
              color: evento.inscripcion_habilitada ? "#1A1300" : T.muted,
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              fontWeight: 600,
              cursor: evento.inscripcion_habilitada ? "pointer" : "not-allowed",
            }}
          >
            {evento.inscripcion_habilitada ? "Inscribirme" : "Cerrada"}
          </button>
        )}
      </div>
    </div>
  );
}
