import { useRef, useState } from "react";
import { Plus, Upload, Pencil, Download } from "lucide-react";
import { T } from "../theme";
import { useEventos } from "../hooks";
import { supabase } from "../lib/supabase";
import { generarGenericImportCsv, descargarCsv } from "../lib/genericImport";
import ArchivosChecklist from "./ArchivosChecklist";

// Infiere qué tipo de archivo de Live Timing es según el nombre, para no
// tener que pedirle al admin que lo indique a mano (ver TIPOS_ARCHIVO en
// ../theme.js -- estos patrones tienen que ir en sincro con esa lista).
// GenericImport.csv NO va acá: es al revés, un archivo que la web *genera*
// para importar los inscriptos a Live Timing (botón "Exportar inscriptos"),
// nunca algo que el admin sube.
function inferirTipo(nombreArchivo) {
  if (/^FinalResults.*\.xls$/i.test(nombreArchivo)) return "resultadosFinales";
  if (/^RoundTopTimes-.*\.xls$/i.test(nombreArchivo)) return "vueltaRapida";
  if (/^RoundResult-.*\.xls$/i.test(nombreArchivo)) return "detalleRondas";
  if (/^Leaderboard-.*\.xls$/i.test(nombreArchivo)) return "clasificacion";
  if (/^SeriesResultReport.*\.xls$/i.test(nombreArchivo)) return "campeonato";
  return null;
}

function archivoABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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

function FilaEvento({ evento, onSubido }) {
  const inputRef = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [exportando, setExportando] = useState(false);

  const exportHabilitado = exportacionHabilitada(evento);

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

  const fechaStr = new Date(evento.fecha + "T00:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Se suben de a uno, en secuencia (no en paralelo): marcarArchivo() en
  // la Edge Function hace un read-modify-write sobre eventos.archivos, y
  // dos uploads en simultáneo para el mismo evento se pisarían el
  // checklist entre sí.
  async function onArchivosElegidos(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    setSubiendo(true);
    setMensaje([]);
    const resultados = [];
    for (const file of files) {
      const tipo = inferirTipo(file.name);
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
        if (error) throw error;
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
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 18, fontWeight: 600 }}>{evento.nombre}</div>
          <div style={{ color: T.muted, fontSize: 13, marginTop: 2 }}>{fechaStr}</div>
          <div style={{ marginTop: 6 }}>
            <InscripcionDiasEditable evento={evento} onGuardado={onSubido} />
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
            onClick={() => inputRef.current?.click()}
            disabled={subiendo}
            title="Subí uno o varios: FinalResults.xls, RoundResult-*.xls, RoundTopTimes-*.xls, Leaderboard-Event*.xls, SeriesResultReport.xls"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${T.amber}66`,
              background: "transparent",
              color: T.amber,
              fontSize: 12,
              fontWeight: 600,
              cursor: subiendo ? "default" : "pointer",
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

  return (
    <div>
      <NuevaFecha onCreado={recargar} />

      {loading && <div style={{ color: T.muted, fontSize: 13 }}>Cargando calendario...</div>}
      {error && <div style={{ color: T.red, fontSize: 13 }}>Error: {error.message}</div>}

      {!loading && !error && eventos.map((e) => <FilaEvento key={e.id} evento={e} onSubido={recargar} />)}
    </div>
  );
}
