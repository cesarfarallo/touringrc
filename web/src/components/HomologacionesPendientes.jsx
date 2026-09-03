import { useState } from "react";
import { Check, X } from "lucide-react";
import { T } from "../theme";
import { useHomologacionesPendientes } from "../hooks";
import { supabase } from "../lib/supabase";

function fechaCorta(fecha) {
  if (!fecha) return null;
  return new Date(`${fecha}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function nombrePiloto(piloto) {
  if (!piloto) return "(piloto desconocido)";
  return [piloto.first_name, piloto.last_name].filter(Boolean).join(" ");
}

function Fila({ pendiente, onResuelto }) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState(null);
  const h = pendiente.homologaciones_neumaticos;

  async function resolver({ aprobar }) {
    setTrabajando(true);
    setError(null);
    if (aprobar) {
      const { error: errorMarca } = await supabase
        .from("homologaciones_neumaticos")
        .update({ marca_id: pendiente.marca_id_nueva })
        .eq("id", pendiente.homologacion_id);
      if (errorMarca) {
        setTrabajando(false);
        setError(errorMarca.message);
        return;
      }
    }
    const { error } = await supabase
      .from("homologaciones_pendientes")
      .update({ resuelto: true, aprobado: aprobar })
      .eq("id", pendiente.id);
    setTrabajando(false);
    if (error) setError(error.message);
    else onResuelto();
  }

  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderRadius: 10,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13 }}>
        <strong>{nombrePiloto(h?.pilotos)}</strong>
        <span style={{ color: T.muted }}> · {h?.clases?.nombre}</span>
        {h?.eventos && <span style={{ color: T.muted }}> · {h.eventos.nombre} ({fechaCorta(h.eventos.fecha)})</span>}
      </div>

      <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ color: T.muted }}>Marca actual:</span>
        <strong>{h?.marcas_neumaticos?.nombre ?? "—"}</strong>
        <span style={{ color: T.muted }}>→ propuesta:</span>
        <strong style={{ color: T.amber }}>{pendiente.marcas_neumaticos?.nombre ?? "—"}</strong>
      </div>

      {pendiente.propuesto_por && (
        <div style={{ fontSize: 12, color: T.muted }}>Propuesto por {pendiente.propuesto_por}</div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          disabled={trabajando}
          onClick={() => resolver({ aprobar: true })}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 8,
            border: `1px solid ${T.teal}55`,
            background: `${T.teal}18`,
            color: T.teal,
            fontSize: 12,
            fontWeight: 600,
            cursor: trabajando ? "default" : "pointer",
          }}
        >
          <Check size={13} /> Aprobar
        </button>
        <button
          disabled={trabajando}
          onClick={() => resolver({ aprobar: false })}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 8,
            border: `1px solid ${T.line}`,
            background: "transparent",
            color: T.muted,
            fontSize: 12,
            fontWeight: 600,
            cursor: trabajando ? "default" : "pointer",
          }}
        >
          <X size={13} /> Rechazar
        </button>
      </div>

      {error && <div style={{ color: T.red, fontSize: 12 }}>{error}</div>}
    </div>
  );
}

// Panel admin (migración 0018): correcciones de marca que técnica
// propuso sobre homologaciones ya cargadas, esperando revisión --
// mismo patrón que VinculosPendientes.jsx. Se muestra siempre, con un
// mensaje de "nada pendiente" cuando la cola está vacía.
export default function HomologacionesPendientes({ onCambio }) {
  const { pendientes, loading, error, recargar } = useHomologacionesPendientes(true);

  function resuelto() {
    recargar();
    onCambio?.();
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ color: T.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
        Correcciones pendientes de revisión
      </div>

      {loading && <div style={{ color: T.muted, fontSize: 13 }}>Cargando...</div>}
      {error && <div style={{ color: T.red, fontSize: 13 }}>Error: {error.message}</div>}

      {!loading && !error && pendientes.length === 0 && (
        <div style={{ color: T.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <Check size={14} color={T.teal} /> No hay nada pendiente de revisar.
        </div>
      )}

      {!loading && pendientes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pendientes.map((p) => (
            <Fila key={p.id} pendiente={p} onResuelto={resuelto} />
          ))}
        </div>
      )}
    </div>
  );
}
