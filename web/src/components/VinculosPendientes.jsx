import { useState } from "react";
import { AlertTriangle, Check, Search } from "lucide-react";
import { T } from "../theme";
import { useVinculosPendientes } from "../hooks";
import { supabase } from "../lib/supabase";
import NombreEditable from "./PilotoEditable";

function nombre(piloto) {
  if (!piloto) return "(desconocido)";
  const n = [piloto.first_name, piloto.last_name].filter(Boolean).join(" ");
  const num = piloto.permanent_number ? ` #${piloto.permanent_number}` : "";
  return `${n || "(sin nombre)"}${num}`;
}

function Fila({ vinculo, pilotosPorId, pilotos, onResuelto }) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const creado = pilotosPorId[vinculo.piloto_creado_id];
  const candidatos = (vinculo.candidatos ?? []).map((id) => ({ id, piloto: pilotosPorId[id] }));

  const textoBusqueda = busqueda.trim().toLowerCase();
  const resultadosBusqueda =
    textoBusqueda.length < 2
      ? []
      : pilotos
          .filter((p) => p.id !== vinculo.piloto_creado_id)
          .filter((p) => [p.first_name, p.last_name].filter(Boolean).join(" ").toLowerCase().includes(textoBusqueda))
          .slice(0, 8);

  // Confirmar/fusionar es el "visto bueno" del admin: recién ahí se
  // otorga el rol 'piloto' (migración 0013), que es lo que habilita
  // inscribirse a una fecha -- hasta entonces el piloto existe y puede
  // loguearse, pero no puede anotarse a nada.
  async function otorgarRolPiloto(pilotoId) {
    return supabase
      .from("piloto_roles")
      .upsert({ piloto_id: pilotoId, rol_id: "piloto" }, { onConflict: "piloto_id,rol_id", ignoreDuplicates: true });
  }

  async function confirmarNuevo() {
    setTrabajando(true);
    setError(null);
    if (vinculo.piloto_creado_id) {
      const { error: errorRol } = await otorgarRolPiloto(vinculo.piloto_creado_id);
      if (errorRol) {
        setTrabajando(false);
        setError(errorRol.message);
        return;
      }
    }
    const { error } = await supabase
      .from("vinculos_pendientes")
      .update({ resuelto: true })
      .eq("id", vinculo.id);
    setTrabajando(false);
    if (error) setError(error.message);
    else onResuelto();
  }

  async function fusionarCon(candidatoId) {
    if (!vinculo.piloto_creado_id) return;
    setTrabajando(true);
    setError(null);
    const { error } = await supabase.rpc("fusionar_pilotos", {
      p_duplicado_id: vinculo.piloto_creado_id,
      p_correcto_id: candidatoId,
    });
    if (error) {
      setTrabajando(false);
      setError(error.message);
      return;
    }
    const { error: errorRol } = await otorgarRolPiloto(candidatoId);
    setTrabajando(false);
    if (errorRol) {
      setError(`Vinculado, pero no se pudo asegurar el rol 'piloto': ${errorRol.message}. Asignalo a mano en la tabla de Pilotos.`);
    }
    onResuelto();
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
        <span style={{ color: T.muted }}>Se logueó:</span>{" "}
        <strong>{vinculo.nombre_login || vinculo.email || "(sin nombre)"}</strong>
        {vinculo.email && <span style={{ color: T.muted }}> · {vinculo.email}</span>}
      </div>

      <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: T.muted }}>Se creó un piloto nuevo:</span>
        {creado ? (
          <NombreEditable piloto={creado} onGuardado={onResuelto} />
        ) : (
          <strong>{nombre(creado)}</strong>
        )}
      </div>

      {candidatos.length > 0 && (
        <div style={{ fontSize: 13 }}>
          <span style={{ color: T.muted }}>Nombre ambiguo, podría ser en cambio:</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            {candidatos.map((c) => (
              <button
                key={c.id}
                disabled={trabajando}
                onClick={() => fusionarCon(c.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: `1px solid ${T.amber}55`,
                  background: `${T.amber}18`,
                  color: T.amber,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: trabajando ? "default" : "pointer",
                }}
              >
                Usar {nombre(c.piloto)} en cambio
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 13 }}>
        <span style={{ color: T.muted }}>¿No es ninguno de estos? Buscá al piloto correcto:</span>
        <div style={{ position: "relative", marginTop: 6, maxWidth: 260 }}>
          <Search size={13} color={T.muted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o apellido..."
            style={{
              background: T.surfaceRaised,
              border: `1px solid ${T.line}`,
              borderRadius: 8,
              padding: "7px 12px 7px 30px",
              color: T.text,
              fontSize: 13,
              width: "100%",
            }}
          />
        </div>
        {resultadosBusqueda.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {resultadosBusqueda.map((p) => (
              <button
                key={p.id}
                disabled={trabajando}
                onClick={() => fusionarCon(p.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: `1px solid ${T.line}`,
                  background: "transparent",
                  color: T.text,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: trabajando ? "default" : "pointer",
                }}
              >
                Vincular con {nombre(p)}
              </button>
            ))}
          </div>
        )}
        {textoBusqueda.length >= 2 && resultadosBusqueda.length === 0 && (
          <div style={{ color: T.muted, fontSize: 12, marginTop: 6 }}>
            Ningún piloto coincide -- corregí el nombre de arriba y confirmá, o creá uno nuevo desde "Agregar piloto a
            mano" más abajo.
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          disabled={trabajando}
          onClick={confirmarNuevo}
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
          <Check size={13} /> Confirmar piloto nuevo (está bien así)
        </button>
      </div>

      {error && <div style={{ color: T.red, fontSize: 12 }}>{error}</div>}
    </div>
  );
}

// Panel admin: logins que no matchearon 1 a 1 contra el roster ya
// cargado. Para cada uno, el admin puede: confirmar que el piloto nuevo
// que se creó está bien, corregirle el nombre a mano, fusionarlo con uno
// de los candidatos ambiguos que detectó el trigger, o buscar y elegir
// cualquier otro piloto ya cargado (búsqueda libre, no solo los
// candidatos automáticos) para vincular en su lugar.
export default function VinculosPendientes({ pilotos, onCambio }) {
  const { vinculos, pilotosPorId, loading, error, recargar } = useVinculosPendientes(true);

  function resuelto() {
    recargar();
    onCambio?.();
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          color: T.muted,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 1.5,
          marginBottom: 10,
        }}
      >
        Vínculos de login pendientes de revisión
      </div>

      {loading && <div style={{ color: T.muted, fontSize: 13 }}>Cargando...</div>}
      {error && <div style={{ color: T.red, fontSize: 13 }}>Error: {error.message}</div>}

      {!loading && !error && vinculos.length === 0 && (
        <div style={{ color: T.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <Check size={14} color={T.teal} /> No hay nada pendiente de revisar.
        </div>
      )}

      {!loading && vinculos.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {vinculos.map((v) => (
            <Fila key={v.id} vinculo={v} pilotosPorId={pilotosPorId} pilotos={pilotos ?? []} onResuelto={resuelto} />
          ))}
        </div>
      )}

      {vinculos.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12, color: T.muted }}>
          <AlertTriangle size={12} /> Fusionar/vincular reasigna todo el historial (resultados, inscripciones) del
          piloto duplicado al que elijas, y borra el duplicado.
        </div>
      )}
    </div>
  );
}
