import { useEffect, useState } from "react";
import { ChevronRight, Pencil } from "lucide-react";
import { T } from "../theme";
import { useClases, useCategoriaPreferida, useInscripcionPiloto } from "../hooks";
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
  const { claseId: categoriaPreferida } = useCategoriaPreferida(piloto.id);
  const [claseId, setClaseId] = useState("");
  const [claseTocada, setClaseTocada] = useState(false);
  const [editandoTx, setEditandoTx] = useState(false);
  const [transponder, setTransponder] = useState(piloto.transponder_number ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  // Precarga la categoría de la última inscripción del piloto (si tiene
  // alguna) -- la mayoría corre siempre en la misma. Solo si todavía no
  // tocó el selector a mano.
  useEffect(() => {
    if (!claseTocada && categoriaPreferida && clases.some((c) => c.id === categoriaPreferida)) {
      setClaseId(categoriaPreferida);
    }
  }, [categoriaPreferida, clases, claseTocada]);

  const mostrarTransponderActual = piloto.transponder_number && !editandoTx;

  async function confirmar() {
    if (!claseId) return;
    setGuardando(true);
    setError(null);

    const { error } = await supabase
      .from("inscripciones")
      .insert({ evento_id: evento.id, piloto_id: piloto.id, clase_id: claseId });
    if (error) {
      setGuardando(false);
      setError(error.message);
      return;
    }

    if (transponder.trim() !== (piloto.transponder_number ?? "")) {
      const { error: errorTx } = await supabase.rpc("actualizar_mi_transponder", {
        p_transponder: transponder.trim(),
      });
      if (errorTx) {
        setGuardando(false);
        setError(`Te inscribiste bien, pero no se pudo guardar el transponder: ${errorTx.message}`);
        onInscripto();
        return;
      }
    }

    setGuardando(false);
    onInscripto();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <select
          value={claseId}
          onChange={(e) => {
            setClaseId(e.target.value);
            setClaseTocada(true);
          }}
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
          <option value="">{cargandoClases ? "Cargando categorías..." : "Elegí tu categoría"}</option>
          {clases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>

        {mostrarTransponderActual ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, color: T.muted, fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>
            Transponder: {piloto.transponder_number}
            <button
              onClick={() => setEditandoTx(true)}
              title="Correr con otro transponder"
              style={{ display: "flex", alignItems: "center", background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 0 }}
            >
              <Pencil size={11} />
            </button>
          </span>
        ) : (
          <input
            type="text"
            value={transponder}
            onChange={(e) => setTransponder(e.target.value)}
            placeholder="Nº de transponder (opcional)"
            style={{
              background: T.surfaceRaised,
              border: `1px solid ${T.line}`,
              borderRadius: 8,
              padding: "8px 10px",
              color: T.text,
              fontSize: 13,
              fontFamily: "JetBrains Mono, monospace",
              width: 180,
            }}
          />
        )}

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
      </div>
      {!mostrarTransponderActual && (
        <div style={{ color: T.muted, fontSize: 11 }}>
          No hace falta que lo cargues ahora — también se puede agregar/cambiar después en la
          pista con el sistema de cronometraje.
        </div>
      )}
      {error && <div style={{ color: T.red, fontSize: 12 }}>{error}</div>}
    </div>
  );
}

export default function EventoCard({ evento, onVerResultados, piloto, logueado }) {
  const fecha = new Date(evento.fecha + "T00:00:00");
  const fechaStr = fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const resultadosDisponibles = evento.corrida || fecha < hoy;
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
          {resultadosDisponibles ? (
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
