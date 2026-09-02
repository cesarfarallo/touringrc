import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { T } from "../theme";
import { useClases, useInscripcionPiloto } from "../hooks";
import { supabase } from "../lib/supabase";

// Ventana de PRE-inscripción: habilitada desde `inscripcion_dias_antes`
// días antes de la fecha del evento, hasta el día ANTERIOR al evento --
// el día de la fecha ya se cierra (es pre-inscripción, no inscripción en
// el momento). Reemplaza el viejo booleano manual `inscripcion_habilitada`
// (migración 0007) -- cada evento configura su propia antelación.
function inscripcionAbierta(evento) {
  if (evento.inscripcion_dias_antes == null) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(evento.fecha + "T00:00:00");
  const desde = new Date(fecha);
  desde.setDate(desde.getDate() - evento.inscripcion_dias_antes);
  return hoy >= desde && hoy < fecha;
}

function FormularioInscripcion({ evento, piloto, onInscripto }) {
  const { clases, loading: cargandoClases } = useClases();
  const [claseId, setClaseId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function confirmar() {
    if (!claseId) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase
      .from("inscripciones")
      .insert({ evento_id: evento.id, piloto_id: piloto.id, clase_id: claseId });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    onInscripto();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <select
        value={claseId}
        onChange={(e) => setClaseId(e.target.value)}
        disabled={cargandoClases}
        style={{
          background: T.surfaceRaised,
          border: `1px solid ${T.line}`,
          borderRadius: 8,
          padding: "8px 10px",
          color: T.text,
          fontSize: 13,
        }}
      >
        <option value="">{cargandoClases ? "Cargando clases..." : "Elegí tu clase"}</option>
        {clases.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <button
        onClick={confirmar}
        disabled={!claseId || guardando}
        style={{
          padding: "8px 16px",
          borderRadius: 8,
          border: "none",
          background: claseId ? T.amber : T.surfaceRaised,
          color: claseId ? "#1A1300" : T.muted,
          fontSize: 13,
          fontWeight: 600,
          cursor: claseId && !guardando ? "pointer" : "default",
        }}
      >
        {guardando ? "Confirmando..." : "Confirmar inscripción"}
      </button>
      {error && <div style={{ width: "100%", color: T.red, fontSize: 12 }}>{error}</div>}
    </div>
  );
}

export default function EventoCard({ evento, onVerResultados, piloto, logueado }) {
  const fecha = new Date(evento.fecha + "T00:00:00");
  const fechaStr = fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const { inscripcion, loading: cargandoInscripcion, recargar } = useInscripcionPiloto(evento.id, piloto?.id);
  const abierta = inscripcionAbierta(evento);

  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
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
          ) : !logueado ? (
            <span style={{ color: T.muted, fontSize: 12, fontFamily: "Inter, sans-serif" }}>
              {abierta ? "Ingresá para inscribirte" : "Inscripción cerrada"}
            </span>
          ) : cargandoInscripcion ? null : inscripcion ? (
            <span style={{ color: T.teal, fontSize: 13, fontFamily: "Inter, sans-serif", fontWeight: 500 }}>
              Inscripto — {inscripcion.clases?.nombre}
            </span>
          ) : (
            <button
              onClick={() => setFormularioAbierto((v) => !v)}
              disabled={!abierta}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "none",
                background: abierta ? T.amber : T.surfaceRaised,
                color: abierta ? "#1A1300" : T.muted,
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                fontWeight: 600,
                cursor: abierta ? "pointer" : "not-allowed",
              }}
            >
              {abierta ? "Inscribirme" : "Cerrada"}
            </button>
          )}
        </div>
      </div>

      {formularioAbierto && logueado && piloto && !inscripcion && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.line}` }}>
          <FormularioInscripcion
            evento={evento}
            piloto={piloto}
            onInscripto={() => {
              setFormularioAbierto(false);
              recargar();
            }}
          />
        </div>
      )}
    </div>
  );
}
