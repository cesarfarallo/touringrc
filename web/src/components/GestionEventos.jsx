import { useMemo, useRef, useState } from "react";
import { Plus, Upload, Pencil, Download, UserPlus, Search } from "lucide-react";
import { T } from "../theme";
import { useEventos, useCircuitos, useClases, usePilotos } from "../hooks";
import { supabase } from "../lib/supabase";
import { generarGenericImportCsv, descargarCsv } from "../lib/genericImport";
import { archivoABase64, extraerMensajeError } from "../lib/edgeFunction";
import ArchivosChecklist from "./ArchivosChecklist";
import { inscripcionAbierta } from "./EventoCard";

// Infiere qué tipo de archivo de Live Timing es según el nombre, para no
// tener que pedirle al admin que lo indique a mano (ver TIPOS_ARCHIVO en
// ../theme.js -- estos patrones tienen que ir en sincro con esa lista).
// GenericImport.csv NO va acá: es al revés, un archivo que la web *genera*
// para importar los inscriptos a Live Timing (botón "Exportar inscriptos"),
// nunca algo que el admin sube.
function inferirTipo(nombreArchivo) {
  if (/^FinalResults.*\.xls$/i.test(nombreArchivo)) return "resultadosFinales";
  if (/roundtoptimes.*\.xls$/i.test(nombreArchivo) || /top[\s_-]*times.*\.xls$/i.test(nombreArchivo)) return "vueltaRapida";
  if (/^RoundResult-.*\.xls$/i.test(nombreArchivo)) return "detalleRondas";
  if (/leaderboard.*\.xls$/i.test(nombreArchivo)) return "clasificacion";
  if (/^SeriesResultReport.*\.xls$/i.test(nombreArchivo)) return "campeonato";
  return null;
}

// El export de inscriptos deja de tener sentido el día de la fecha (ya
// se corrió, o está por correrse) -- mismo criterio de corte que la
// ventana de pre-inscripción en EventoCard.jsx.
function exportacionHabilitada(evento) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(evento.fecha + "T00:00:00");
  return hoy < fecha;
}

// No tiene sentido subir resultados de una fecha que todavía no se corrió
// -- se habilita recién el día del evento en adelante.
function subidaHabilitada(evento) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(evento.fecha + "T00:00:00");
  return hoy >= fecha;
}

// El acumulado de campeonato no tiene evento propio -- se sube contra el
// campeonato vigente (el de fecha_inicio más reciente), igual criterio que
// useCampeonato() en ../hooks.js.
async function campeonatoVigenteId() {
  const { data, error } = await supabase
    .from("campeonatos")
    .select("id")
    .order("fecha_inicio", { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data?.length) throw new Error("No hay ningún campeonato cargado todavía");
  return data[0].id;
}

function NuevaFecha({ onCreado }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState("");
  const [diasAntes, setDiasAntes] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function crear(e) {
    e.preventDefault();
    if (!nombre.trim() || !fecha) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase.from("eventos").insert({
      nombre: nombre.trim(),
      fecha,
      inscripcion_dias_antes: diasAntes === "" ? null : Number(diasAntes),
    });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNombre("");
    setFecha("");
    setDiasAntes("");
    setAbierto(false);
    onCreado();
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          padding: "10px 16px",
          borderRadius: 8,
          border: `1px dashed ${T.amber}66`,
          background: "transparent",
          color: T.amber,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <Plus size={15} /> Agregar fecha al calendario
      </button>
    );
  }

  return (
    <form
      onSubmit={crear}
      style={{
        marginBottom: 16,
        padding: 16,
        borderRadius: 10,
        border: `1px solid ${T.line}`,
        background: T.surface,
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "flex-end",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 11, color: T.muted }}>Nombre</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Fecha 8 Metro"
          required
          style={{
            background: T.surfaceRaised,
            border: `1px solid ${T.line}`,
            borderRadius: 8,
            padding: "8px 12px",
            color: T.text,
            fontSize: 13,
            minWidth: 180,
          }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 11, color: T.muted }}>Fecha</label>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          required
          style={{
            background: T.surfaceRaised,
            border: `1px solid ${T.line}`,
            borderRadius: 8,
            padding: "8px 12px",
            color: T.text,
            fontSize: 13,
            fontFamily: "JetBrains Mono, monospace",
          }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 11, color: T.muted }}>Inscripción (días antes)</label>
        <input
          type="number"
          min="0"
          value={diasAntes}
          onChange={(e) => setDiasAntes(e.target.value)}
          placeholder="ej. 10"
          style={{
            background: T.surfaceRaised,
            border: `1px solid ${T.line}`,
            borderRadius: 8,
            padding: "8px 12px",
            color: T.text,
            fontSize: 13,
            fontFamily: "JetBrains Mono, monospace",
            width: 90,
          }}
        />
      </div>
      <button
        type="submit"
        disabled={guardando}
        style={{
          padding: "9px 16px",
          borderRadius: 8,
          border: "none",
          background: T.amber,
          color: "#1A1300",
          fontSize: 13,
          fontWeight: 600,
          cursor: guardando ? "default" : "pointer",
        }}
      >
        {guardando ? "Creando..." : "Crear"}
      </button>
      <button
        type="button"
        onClick={() => setAbierto(false)}
        style={{ border: "none", background: "transparent", color: T.muted, fontSize: 13, cursor: "pointer" }}
      >
        Cancelar
      </button>
      {error && <div style={{ width: "100%", color: T.red, fontSize: 12 }}>{error}</div>}
    </form>
  );
}

function InscripcionDiasEditable({ evento, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(evento.inscripcion_dias_antes ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { error } = await supabase
      .from("eventos")
      .update({ inscripcion_dias_antes: valor === "" ? null : Number(valor) })
      .eq("id", evento.id);
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
      <button
        onClick={() => {
          setValor(evento.inscripcion_dias_antes ?? "");
          setEditando(true);
        }}
        title="Editar días de antelación para inscripción"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "none",
          color: T.muted,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 12,
          cursor: "pointer",
          padding: 0,
        }}
      >
        {evento.inscripcion_dias_antes != null ? `Inscripción: ${evento.inscripcion_dias_antes}d antes` : "Sin inscripción online"}{" "}
        <Pencil size={11} />
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        min="0"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="días"
        autoFocus
        style={{
          background: T.surfaceRaised,
          border: `1px solid ${T.line}`,
          borderRadius: 6,
          padding: "4px 8px",
          color: T.text,
          fontSize: 12,
          fontFamily: "JetBrains Mono, monospace",
          width: 60,
        }}
      />
      <button
        onClick={guardar}
        disabled={guardando}
        style={{ border: "none", background: "transparent", color: T.amber, fontSize: 12, cursor: "pointer" }}
      >
        {guardando ? "..." : "Guardar"}
      </button>
      <button
        onClick={() => setEditando(false)}
        style={{ border: "none", background: "transparent", color: T.muted, fontSize: 12, cursor: "pointer" }}
      >
        Cancelar
      </button>
      {error && <span style={{ color: T.red, fontSize: 11 }}>{error}</span>}
    </div>
  );
}

// Asocia un circuito (y su sentido) a la fecha, para que se vea el dibujo
// en la tarjeta del Calendario público (EventoCard.jsx). Ver migración 0009.
function CircuitoEditable({ evento, onGuardado }) {
  const { circuitos, loading: cargandoCircuitos } = useCircuitos();
  const [editando, setEditando] = useState(false);
  const [circuitoId, setCircuitoId] = useState(evento.circuito_id ?? "");
  const [sentido, setSentido] = useState(evento.circuito_sentido ?? "normal");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { error } = await supabase
      .from("eventos")
      .update({ circuito_id: circuitoId || null, circuito_sentido: sentido })
      .eq("id", evento.id);
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
      <button
        onClick={() => {
          setCircuitoId(evento.circuito_id ?? "");
          setSentido(evento.circuito_sentido ?? "normal");
          setEditando(true);
        }}
        title="Editar circuito"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "none",
          color: T.muted,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 12,
          cursor: "pointer",
          padding: 0,
        }}
      >
        {evento.circuitos ? `Circuito: ${evento.circuitos.nombre} (${evento.circuito_sentido})` : "Sin circuito asociado"} <Pencil size={11} />
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <select
        value={circuitoId}
        onChange={(e) => setCircuitoId(e.target.value)}
        disabled={cargandoCircuitos}
        style={{ background: T.surfaceRaised, border: `1px solid ${T.line}`, borderRadius: 6, padding: "4px 8px", color: T.text, fontSize: 12 }}
      >
        <option value="">Sin circuito</option>
        {circuitos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <select
        value={sentido}
        onChange={(e) => setSentido(e.target.value)}
        disabled={!circuitoId}
        style={{ background: T.surfaceRaised, border: `1px solid ${T.line}`, borderRadius: 6, padding: "4px 8px", color: T.text, fontSize: 12 }}
      >
        <option value="normal">Normal</option>
        <option value="invertido">Invertido</option>
      </select>
      <button onClick={guardar} disabled={guardando} style={{ border: "none", background: "transparent", color: T.amber, fontSize: 12, cursor: "pointer" }}>
        {guardando ? "..." : "Guardar"}
      </button>
      <button onClick={() => setEditando(false)} style={{ border: "none", background: "transparent", color: T.muted, fontSize: 12, cursor: "pointer" }}>
        Cancelar
      </button>
      {error && <span style={{ color: T.red, fontSize: 11 }}>{error}</span>}
    </div>
  );
}

function DatosEventoEditable({ evento, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(evento.nombre);
  const [fecha, setFecha] = useState(evento.fecha);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function guardar() {
    if (!nombre.trim() || !fecha) return;
    setGuardando(true);
    setError(null);
    const { error: errorGuardado } = await supabase
      .from("eventos")
      .update({ nombre: nombre.trim(), fecha })
      .eq("id", evento.id);
    setGuardando(false);
    if (errorGuardado) {
      setError(errorGuardado.message);
      return;
    }
    setEditando(false);
    onGuardado();
  }

  if (!editando) {
    return (
      <button
        onClick={() => {
          setNombre(evento.nombre);
          setFecha(evento.fecha);
          setEditando(true);
        }}
        title="Editar nombre y fecha"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 2,
          padding: 0,
          border: "none",
          background: "transparent",
          color: T.text,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "Oswald, sans-serif", fontSize: 18, fontWeight: 600 }}>
          {evento.nombre} <Pencil size={11} color={T.muted} />
        </span>
        <span style={{ color: T.muted, fontSize: 13 }}>{new Date(evento.fecha + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}</span>
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        aria-label="Nombre del evento"
        autoFocus
        style={{ background: T.surfaceRaised, border: `1px solid ${T.line}`, borderRadius: 6, padding: "6px 8px", color: T.text, fontSize: 14 }}
      />
      <input
        type="date"
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
        aria-label="Fecha del evento"
        style={{ background: T.surfaceRaised, border: `1px solid ${T.line}`, borderRadius: 6, padding: "6px 8px", color: T.text, fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={guardar} disabled={guardando} style={{ border: "none", background: "transparent", color: T.amber, fontSize: 12, cursor: "pointer" }}>
          {guardando ? "..." : "Guardar"}
        </button>
        <button onClick={() => setEditando(false)} style={{ border: "none", background: "transparent", color: T.muted, fontSize: 12, cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
      {error && <span style={{ color: T.red, fontSize: 11 }}>{error}</span>}
    </div>
  );
}

// Inscribir a un piloto a mano (ej. alguien que se anota en boca de
// pista) -- busca en el roster completo, no solo entre los ya
// vinculados a una cuenta, y hace el insert directo con la policy de
// admin de la migración 0015 (bypassea el chequeo de tiene_modulo que
// aplica al autoservicio del propio piloto). Respeta la misma ventana
// que "Inscribirme" en el Calendario público (inscripcionAbierta(),
// desde `fecha - inscripcion_dias_antes` hasta el día anterior a la
// fecha) -- no tiene sentido anotar a alguien a mano a una inscripción
// que ya cerró o todavía no abrió, aunque sea el admin quien lo haga.
function InscribirPiloto({ evento, pilotos, onInscripto }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [pilotoElegido, setPilotoElegido] = useState(null);
  const [claseId, setClaseId] = useState("");
  const { clases, loading: cargandoClases } = useClases();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const abierta = inscripcionAbierta(evento);

  const textoBusqueda = busqueda.trim().toLowerCase();
  const resultados =
    textoBusqueda.length < 2
      ? []
      : pilotos
          .filter((p) => [p.first_name, p.last_name].filter(Boolean).join(" ").toLowerCase().includes(textoBusqueda))
          .slice(0, 8);

  async function inscribir() {
    if (!pilotoElegido || !claseId || !abierta) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase
      .from("inscripciones")
      .insert({ evento_id: evento.id, piloto_id: pilotoElegido.id, clase_id: claseId });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setAbierto(false);
    setBusqueda("");
    setPilotoElegido(null);
    setClaseId("");
    onInscripto();
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        disabled={!abierta}
        title={!abierta ? "La inscripción no está abierta para esta fecha (ver días de antelación)" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          borderRadius: 8,
          border: `1px solid ${T.line}`,
          background: "transparent",
          color: abierta ? T.text : T.muted,
          fontSize: 12,
          fontWeight: 600,
          cursor: abierta ? "pointer" : "not-allowed",
        }}
      >
        <UserPlus size={13} /> Inscribir piloto
      </button>
    );
  }

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 10, border: `1px solid ${T.line}`, background: T.surfaceRaised, display: "flex", flexDirection: "column", gap: 8 }}>
      {!pilotoElegido ? (
        <div style={{ position: "relative", maxWidth: 260 }}>
          <Search size={13} color={T.muted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar piloto por nombre o apellido..."
            autoFocus
            style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: "7px 12px 7px 30px", color: T.text, fontSize: 13, width: "100%" }}
          />
          {resultados.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {resultados.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPilotoElegido(p)}
                  style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${T.line}`, background: T.surface, color: T.text, fontSize: 12, cursor: "pointer" }}
                >
                  {[p.first_name, p.last_name].filter(Boolean).join(" ") || "(sin nombre)"}
                </button>
              ))}
            </div>
          )}
          {textoBusqueda.length >= 2 && resultados.length === 0 && (
            <div style={{ color: T.muted, fontSize: 12, marginTop: 6 }}>Ningún piloto coincide.</div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {[pilotoElegido.first_name, pilotoElegido.last_name].filter(Boolean).join(" ")}
          </span>
          <button onClick={() => setPilotoElegido(null)} style={{ border: "none", background: "transparent", color: T.muted, fontSize: 12, cursor: "pointer" }}>
            Cambiar
          </button>
          <select
            value={claseId}
            onChange={(e) => setClaseId(e.target.value)}
            disabled={cargandoClases}
            style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: "6px 10px", color: T.text, fontSize: 13 }}
          >
            <option value="">{cargandoClases ? "Cargando categorías..." : "Elegí la categoría"}</option>
            {clases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <button
            onClick={inscribir}
            disabled={!claseId || !abierta || guardando}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              background: claseId && abierta ? T.amber : T.surface,
              color: claseId && abierta ? "#1A1300" : T.muted,
              fontSize: 12,
              fontWeight: 600,
              cursor: claseId && abierta && !guardando ? "pointer" : "default",
            }}
          >
            {guardando ? "Inscribiendo..." : "Confirmar"}
          </button>
        </div>
      )}
      <button onClick={() => setAbierto(false)} style={{ alignSelf: "flex-start", border: "none", background: "transparent", color: T.muted, fontSize: 12, cursor: "pointer", padding: 0 }}>
        Cancelar
      </button>
      {error && <div style={{ color: T.red, fontSize: 12 }}>{error}</div>}
    </div>
  );
}

function FilaEvento({ evento, onSubido, pilotos }) {
  const inputRef = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [exportando, setExportando] = useState(false);

  const exportHabilitado = exportacionHabilitada(evento);
  const subidaOk = subidaHabilitada(evento);

  async function exportarInscriptos() {
    if (!exportHabilitado) return;
    setExportando(true);
    setMensaje(null);
    try {
      const { data, error } = await supabase
        .from("inscripciones")
        .select("pilotos ( first_name, last_name, email, registration_number, permanent_number, transponder_number ), clases ( nombre )")
        .eq("evento_id", evento.id);
      if (error) throw error;
      if (!data?.length) {
        setMensaje([{ ok: false, texto: "Todavía no hay inscriptos en esta fecha" }]);
        return;
      }
      const inscriptos = data.map((i) => ({ ...i.pilotos, clase_nombre: i.clases?.nombre }));
      descargarCsv(`GenericImport-${evento.nombre.replace(/\s+/g, "_")}.csv`, generarGenericImportCsv(inscriptos));
    } catch (err) {
      setMensaje([{ ok: false, texto: err.message ?? String(err) }]);
    } finally {
      setExportando(false);
    }
  }

  // Se suben de a uno, en secuencia (no en paralelo): marcarArchivo() en
  // la Edge Function hace un read-modify-write sobre eventos.archivos, y
  // dos uploads en simultáneo para el mismo evento se pisarían el
  // checklist entre sí.
  async function onArchivosElegidos(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !subidaOk) return;

    setSubiendo(true);
    setMensaje([]);
    const resultados = [];
    // FinalResults must exist before TopTimes can mark its pilot. This also
    // makes multi-file uploads deterministic regardless of selection order.
    const prioridad = {
      resultadosFinales: 0,
      vueltaRapida: 1,
      detalleRondas: 2,
      clasificacion: 3,
      campeonato: 4,
    };
    const archivosOrdenados = files
      .map((file, indice) => ({ file, indice, tipo: inferirTipo(file.name) }))
      .sort((a, b) => {
        const prioridadA = prioridad[a.tipo] ?? Number.MAX_SAFE_INTEGER;
        const prioridadB = prioridad[b.tipo] ?? Number.MAX_SAFE_INTEGER;
        return prioridadA - prioridadB || a.indice - b.indice;
      });

    for (const { file, tipo } of archivosOrdenados) {
      if (!tipo) {
        resultados.push({ nombre: file.name, ok: false, texto: "No lo reconozco como un export de Live Timing" });
        setMensaje([...resultados]);
        continue;
      }
      try {
        const contenidoBase64 = await archivoABase64(file);
        const body = { eventoId: evento.id, tipo, contenidoBase64 };
        if (tipo === "campeonato") body.campeonatoId = await campeonatoVigenteId();

        const { data, error } = await supabase.functions.invoke("subir-resultado", { body });
        if (error) throw new Error(await extraerMensajeError(error));
        if (data?.error) throw new Error(data.error);

        resultados.push({ nombre: file.name, ok: true, texto: data?.resumen ?? "Listo" });
      } catch (err) {
        resultados.push({ nombre: file.name, ok: false, texto: err.message ?? String(err) });
      }
      setMensaje([...resultados]);
    }
    setSubiendo(false);
    onSubido();
  }

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <DatosEventoEditable evento={evento} onGuardado={onSubido} />
          <div style={{ marginTop: 6 }}>
            <InscripcionDiasEditable evento={evento} onGuardado={onSubido} />
          </div>
          <div style={{ marginTop: 6 }}>
            <CircuitoEditable evento={evento} onGuardado={onSubido} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={exportarInscriptos}
            disabled={exportando || !exportHabilitado}
            title={
              exportHabilitado
                ? "Genera el GenericImport.csv para importar en Live Timing"
                : "Se deshabilita el día de la fecha"
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${T.line}`,
              background: "transparent",
              color: exportHabilitado ? T.text : T.muted,
              fontSize: 12,
              fontWeight: 600,
              cursor: exportando || !exportHabilitado ? "default" : "pointer",
            }}
          >
            <Download size={13} />
            {exportando ? "Exportando..." : "Exportar inscriptos"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xls"
            multiple
            onChange={onArchivosElegidos}
            style={{ display: "none" }}
          />
          <button
            onClick={() => subidaOk && inputRef.current?.click()}
            disabled={subiendo || !subidaOk}
            title={
              subidaOk
                ? "Subí uno o varios: FinalResults.xls, RoundResult-*.xls, RoundTopTimes-*.xls, Leaderboard-Event*.xls, SeriesResultReport.xls"
                : "Se habilita el día de la fecha en adelante"
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${T.amber}66`,
              background: "transparent",
              color: subidaOk ? T.amber : T.muted,
              fontSize: 12,
              fontWeight: 600,
              cursor: subiendo || !subidaOk ? "default" : "pointer",
            }}
          >
            <Upload size={13} />
            {subiendo ? "Subiendo..." : "Subir resultados"}
          </button>
        </div>
      </div>
      {mensaje && mensaje.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {mensaje.map((m, i) => (
            <div key={i} style={{ fontSize: 12, color: m.ok ? T.teal : T.red }}>
              {m.ok ? "✓ " : "✗ "}
              {m.nombre ? `${m.nombre}: ` : ""}
              {m.texto}
            </div>
          ))}
        </div>
      )}
      <InscribirPiloto evento={evento} pilotos={pilotos} onInscripto={onSubido} />
      <ArchivosChecklist archivos={evento.archivos} />
    </div>
  );
}

// Módulo admin: alta de fechas del calendario y subida de los archivos de
// resultados de cada evento (corre server-side vía la Edge Function
// subir-resultado). Requiere las policies de insert/update de la
// migración 0004.
export default function GestionEventos() {
  const { eventos, loading, error, recargar } = useEventos();
  const { pilotos } = usePilotos();
  const eventosOrdenados = useMemo(() => {
    return [...eventos].sort(
      (a, b) => new Date(`${b.fecha}T00:00:00`) - new Date(`${a.fecha}T00:00:00`)
    );
  }, [eventos]);

  return (
    <div>
      <NuevaFecha onCreado={recargar} />

      {loading && <div style={{ color: T.muted, fontSize: 13 }}>Cargando calendario...</div>}
      {error && <div style={{ color: T.red, fontSize: 13 }}>Error: {error.message}</div>}

      {!error && eventosOrdenados.map((e) => <FilaEvento key={e.id} evento={e} onSubido={recargar} pilotos={pilotos} />)}
    </div>
  );
}
