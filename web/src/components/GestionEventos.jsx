import { useRef, useState } from "react";
import { Plus, Upload } from "lucide-react";
import { T } from "../theme";
import { useEventos } from "../hooks";
import { supabase } from "../lib/supabase";
import ArchivosChecklist from "./ArchivosChecklist";

// Infiere qué tipo de archivo de Live Timing es según el nombre, para no
// tener que pedirle al admin que lo indique a mano (ver TIPOS_ARCHIVO en
// ../theme.js -- estos patrones tienen que ir en sincro con esa lista).
function inferirTipo(nombreArchivo) {
  if (/^GenericImport.*\.csv$/i.test(nombreArchivo)) return "pilotos";
  if (/^FinalResults.*\.xls$/i.test(nombreArchivo)) return "resultadosFinales";
  if (/^RoundTopTimes-.*\.xls$/i.test(nombreArchivo)) return "vueltaRapida";
  if (/^RoundResult-.*\.xls$/i.test(nombreArchivo)) return "detalleRondas";
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
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function crear(e) {
    e.preventDefault();
    if (!nombre.trim() || !fecha) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase.from("eventos").insert({ nombre: nombre.trim(), fecha });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNombre("");
    setFecha("");
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

function FilaEvento({ evento, onSubido }) {
  const inputRef = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const fechaStr = new Date(evento.fecha + "T00:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  async function onArchivoElegido(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const tipo = inferirTipo(file.name);
    if (!tipo) {
      setMensaje({ ok: false, texto: `No reconozco "${file.name}" como un export de Live Timing` });
      return;
    }

    setSubiendo(true);
    setMensaje(null);
    try {
      const contenidoBase64 = await archivoABase64(file);
      const body = { eventoId: evento.id, tipo, contenidoBase64 };
      if (tipo === "campeonato") body.campeonatoId = await campeonatoVigenteId();

      const { data, error } = await supabase.functions.invoke("subir-resultado", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setMensaje({ ok: true, texto: data?.resumen ?? "Listo" });
      onSubido();
    } catch (err) {
      setMensaje({ ok: false, texto: err.message ?? String(err) });
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 18, fontWeight: 600 }}>{evento.nombre}</div>
          <div style={{ color: T.muted, fontSize: 13, marginTop: 2 }}>{fechaStr}</div>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xls"
            onChange={onArchivoElegido}
            style={{ display: "none" }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={subiendo}
            title="Subí un GenericImport.csv, FinalResults.xls, RoundResult-*.xls, RoundTopTimes-*.xls o SeriesResultReport.xls"
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
      {mensaje && (
        <div style={{ marginTop: 10, fontSize: 12, color: mensaje.ok ? T.teal : T.red }}>
          {mensaje.ok ? "✓ " : "✗ "}
          {mensaje.texto}
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
