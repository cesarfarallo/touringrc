import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2, RefreshCcw, Upload } from "lucide-react";
import { T } from "../theme";
import { useCircuitos, useCircuitoRecords, useClases } from "../hooks";
import { supabase } from "../lib/supabase";
import { archivoABase64, extraerMensajeError } from "../lib/edgeFunction";
import { rutaImagenCircuito as rutaImagen } from "../lib/circuitos";

function NombreCircuitoEditable({ circuito, esAdmin, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(circuito.nombre);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function guardar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase.from("circuitos").update({ nombre: nombre.trim() }).eq("id", circuito.id);
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditando(false);
    onGuardado();
  }

  if (!editando) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 24, fontWeight: 600 }}>{circuito.nombre}</span>
        {esAdmin && (
          <button
            onClick={() => {
              setNombre(circuito.nombre);
              setEditando(true);
            }}
            title="Editar nombre"
            style={{ display: "flex", background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 0 }}
          >
            <Pencil size={14} />
          </button>
        )}
      </span>
    );
  }

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        autoFocus
        style={{ background: T.surfaceRaised, border: `1px solid ${T.line}`, borderRadius: 6, padding: "6px 8px", color: T.text, fontSize: 16 }}
      />
      <button onClick={guardar} disabled={guardando} style={{ border: "none", background: "transparent", color: T.amber, fontSize: 13, cursor: "pointer" }}>
        {guardando ? "..." : "Guardar"}
      </button>
      <button onClick={() => setEditando(false)} style={{ border: "none", background: "transparent", color: T.muted, fontSize: 13, cursor: "pointer" }}>
        Cancelar
      </button>
      {error && <span style={{ color: T.red, fontSize: 11 }}>{error}</span>}
    </span>
  );
}

function FormularioRecord({ circuitoId, sentido, clase, record, onCancelar, onGuardado }) {
  const [pilotoNombre, setPilotoNombre] = useState(record?.pilotoNombre ?? "");
  const [tiempo, setTiempo] = useState(record?.tiempo ?? "");
  const [fecha, setFecha] = useState(record?.fecha ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function guardar() {
    if (!pilotoNombre.trim() || !tiempo.trim()) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase.from("circuito_records").upsert(
      {
        circuito_id: circuitoId,
        clase_id: clase.id,
        sentido,
        piloto_nombre: pilotoNombre.trim(),
        tiempo: tiempo.trim(),
        fecha: fecha || null,
      },
      { onConflict: "circuito_id,clase_id,sentido" }
    );
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    onGuardado();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <input
        value={pilotoNombre}
        onChange={(e) => setPilotoNombre(e.target.value)}
        placeholder="Piloto"
        autoFocus
        style={{ background: T.surfaceRaised, border: `1px solid ${T.line}`, borderRadius: 6, padding: "5px 8px", color: T.text, fontSize: 12, width: 140 }}
      />
      <input
        value={tiempo}
        onChange={(e) => setTiempo(e.target.value)}
        placeholder="Tiempo"
        style={{ background: T.surfaceRaised, border: `1px solid ${T.line}`, borderRadius: 6, padding: "5px 8px", color: T.text, fontSize: 12, fontFamily: "JetBrains Mono, monospace", width: 100 }}
      />
      <input
        type="date"
        value={fecha ?? ""}
        onChange={(e) => setFecha(e.target.value)}
        style={{ background: T.surfaceRaised, border: `1px solid ${T.line}`, borderRadius: 6, padding: "5px 8px", color: T.text, fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}
      />
      <button onClick={guardar} disabled={guardando} style={{ border: "none", background: "transparent", color: T.amber, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
        {guardando ? "..." : "Guardar"}
      </button>
      <button onClick={onCancelar} style={{ border: "none", background: "transparent", color: T.muted, fontSize: 12, cursor: "pointer" }}>
        Cancelar
      </button>
      {error && <span style={{ width: "100%", color: T.red, fontSize: 11 }}>{error}</span>}
    </div>
  );
}

function FilaRecord({ clase, record, circuitoId, sentido, esAdmin, onGuardado }) {
  const [editando, setEditando] = useState(false);

  async function borrar() {
    if (!confirm(`¿Borrar el récord de ${clase.nombre}?`)) return;
    await supabase.from("circuito_records").delete().eq("id", record.id);
    onGuardado();
  }

  return (
    <tr style={{ borderBottom: `1px solid ${T.line}` }}>
      <td style={{ padding: "10px 14px", fontFamily: "Inter, sans-serif", color: T.muted, fontSize: 13 }}>{clase.nombre}</td>
      {editando ? (
        <td colSpan={3} style={{ padding: "8px 14px" }}>
          <FormularioRecord
            circuitoId={circuitoId}
            sentido={sentido}
            clase={clase}
            record={record}
            onCancelar={() => setEditando(false)}
            onGuardado={() => {
              setEditando(false);
              onGuardado();
            }}
          />
        </td>
      ) : record ? (
        <>
          <td style={{ padding: "10px 14px", fontFamily: "Inter, sans-serif", color: T.text, fontWeight: 500 }}>{record.pilotoNombre}</td>
          <td style={{ padding: "10px 14px", fontFamily: "JetBrains Mono, monospace", color: T.amber, fontWeight: 700 }}>{record.tiempo}</td>
          <td style={{ padding: "10px 14px", fontFamily: "JetBrains Mono, monospace", color: T.muted, fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {record.fecha ? new Date(record.fecha + "T00:00:00").toLocaleDateString("es-AR") : "—"}
              {esAdmin && (
                <span style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setEditando(true)} title="Editar" style={{ display: "flex", background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 0 }}>
                    <Pencil size={12} />
                  </button>
                  <button onClick={borrar} title="Borrar" style={{ display: "flex", background: "transparent", border: "none", color: T.red, cursor: "pointer", padding: 0 }}>
                    <Trash2 size={12} />
                  </button>
                </span>
              )}
            </div>
          </td>
        </>
      ) : (
        <td colSpan={3} style={{ padding: "10px 14px" }}>
          {esAdmin ? (
            <button
              onClick={() => setEditando(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: T.amber, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}
            >
              <Plus size={12} /> Cargar récord
            </button>
          ) : (
            <span style={{ color: T.muted, fontSize: 12 }}>Sin récord cargado</span>
          )}
        </td>
      )}
    </tr>
  );
}

// Importa el récord vigente de cada categoría desde el reporte "Track
// Records" que exporta Live Timing (RaceResultRecords*.xls). El archivo
// no indica a qué circuito ni a qué sentido pertenece -- se guarda para
// el circuito y el sentido (Normal/Invertido) que estén activos en la
// vista en ese momento. Pisa el récord anterior de esa categoría+sentido
// (el reporte siempre trae el mejor tiempo vigente).
function ImportarRecords({ circuitoId, sentido, onImportado }) {
  const inputRef = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  async function onArchivoElegido(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true);
    setMensaje(null);
    try {
      const contenidoBase64 = await archivoABase64(file);
      const { data, error } = await supabase.functions.invoke("subir-resultado", {
        body: { tipo: "recordsCircuito", circuitoId, sentido, contenidoBase64 },
      });
      if (error) throw new Error(await extraerMensajeError(error));
      if (data?.error) throw new Error(data.error);
      setMensaje({ ok: true, texto: data?.resumen ?? "Listo" });
      onImportado();
    } catch (err) {
      setMensaje({ ok: false, texto: err.message ?? String(err) });
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <input ref={inputRef} type="file" accept=".xls" onChange={onArchivoElegido} style={{ display: "none" }} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={subiendo}
        title={`Subí el reporte 'Track Records' (RaceResultRecords*.xls) que exporta Live Timing -- se guarda para el sentido ${sentido === "invertido" ? "Invertido" : "Normal"}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "none",
          color: T.amber,
          fontSize: 11,
          fontWeight: 600,
          cursor: subiendo ? "default" : "pointer",
          padding: 0,
        }}
      >
        <Upload size={12} /> {subiendo ? "Importando..." : "Importar records"}
      </button>
      {mensaje && (
        <div style={{ fontSize: 11, color: mensaje.ok ? T.teal : T.red, textAlign: "right", maxWidth: 220 }}>
          {mensaje.ok ? "✓ " : "✗ "}
          {mensaje.texto}
        </div>
      )}
    </div>
  );
}

// Apartado público "Circuitos": las 7 pistas del club, cada una con su
// dibujo (normal/invertido, ver migración 0009) y el récord vigente por
// categoría al lado. La carga/edición de récords y el renombrado quedan
// visibles inline (mismo patrón de lápiz que GestionEventos.jsx) solo para
// admin -- no hace falta un sub-tab aparte dentro de Admin porque está
// atado 1 a 1 a esta vista.
export default function CircuitosView({ esAdmin }) {
  const { circuitos, loading, error, recargar: recargarCircuitos } = useCircuitos();
  const { clases } = useClases();
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [sentido, setSentido] = useState("normal");

  const circuitoActivo = circuitos.find((c) => c.id === seleccionadoId) ?? circuitos[0];

  useEffect(() => {
    if (!seleccionadoId && circuitos.length > 0) setSeleccionadoId(circuitos[0].id);
  }, [circuitos, seleccionadoId]);

  useEffect(() => {
    setSentido("normal");
  }, [circuitoActivo?.id]);

  const { porClase: records, loading: cargandoRecords, recargar } = useCircuitoRecords(circuitoActivo?.id, sentido);

  if (loading) return <div style={{ color: T.muted, fontSize: 13 }}>Cargando circuitos...</div>;
  if (error) return <div style={{ color: T.red, fontSize: 13 }}>Error: {error.message}</div>;
  if (!circuitoActivo) return <div style={{ color: T.muted, fontSize: 13 }}>Todavía no hay circuitos cargados.</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {circuitos.map((c) => (
          <button
            key={c.id}
            onClick={() => setSeleccionadoId(c.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px 6px 6px",
              borderRadius: 8,
              border: `1px solid ${circuitoActivo.id === c.id ? T.amber : T.line}`,
              background: circuitoActivo.id === c.id ? `${T.amber}18` : "transparent",
              color: circuitoActivo.id === c.id ? T.amber : T.muted,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <img src={rutaImagen(c, "normal")} alt="" style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 4, background: "#FFFFFF", padding: 2 }} />
            {c.nombre}
          </button>
        ))}
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <NombreCircuitoEditable circuito={circuitoActivo} esAdmin={esAdmin} onGuardado={recargarCircuitos} />
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { id: "normal", label: "Normal" },
              { id: "invertido", label: "Invertido" },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setSentido(s.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: `1px solid ${sentido === s.id ? T.amber : T.line}`,
                  background: sentido === s.id ? `${T.amber}18` : "transparent",
                  color: sentido === s.id ? T.amber : T.muted,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          <img
            src={rutaImagen(circuitoActivo, sentido)}
            alt={`${circuitoActivo.nombre} (${sentido})`}
            style={{ maxWidth: "100%", width: 420, borderRadius: 10, background: "#FFFFFF", border: `1px solid ${T.line}`, padding: 8, flexShrink: 0 }}
          />

          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ color: T.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5 }}>
                  Récords por categoría ({sentido === "invertido" ? "Invertido" : "Normal"})
                </div>
                <button
                  onClick={recargar}
                  title="Actualizar"
                  style={{ display: "flex", background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 0 }}
                >
                  <RefreshCcw size={13} />
                </button>
              </div>
              {esAdmin && <ImportarRecords circuitoId={circuitoActivo.id} sentido={sentido} onImportado={recargar} />}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 420, borderCollapse: "collapse" }}>
                <tbody>
                  {cargandoRecords ? (
                    <tr>
                      <td style={{ padding: "10px 14px", color: T.muted, fontSize: 13 }}>Cargando récords...</td>
                    </tr>
                  ) : clases.length === 0 ? (
                    <tr>
                      <td style={{ padding: "10px 14px", color: T.muted, fontSize: 13 }}>No hay categorías cargadas.</td>
                    </tr>
                  ) : (
                    clases.map((clase) => (
                      <FilaRecord
                        key={clase.id}
                        clase={clase}
                        record={records[clase.nombre]}
                        circuitoId={circuitoActivo.id}
                        sentido={sentido}
                        esAdmin={esAdmin}
                        onGuardado={recargar}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
