import { useState } from "react";
import { Plus, Upload } from "lucide-react";
import { T } from "../theme";
import { useEventos } from "../hooks";
import { supabase } from "../lib/supabase";
import ArchivosChecklist from "./ArchivosChecklist";

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

function FilaEvento({ evento }) {
  const fechaStr = new Date(evento.fecha + "T00:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 18, fontWeight: 600 }}>{evento.nombre}</div>
          <div style={{ color: T.muted, fontSize: 13, marginTop: 2 }}>{fechaStr}</div>
        </div>
        <button
          disabled
          title="Todavía no implementado: va a correr con una Supabase Edge Function"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 8,
            border: `1px solid ${T.line}`,
            background: "transparent",
            color: T.muted,
            fontSize: 12,
            fontWeight: 500,
            cursor: "not-allowed",
          }}
        >
          <Upload size={13} /> Subir resultados (próximamente)
        </button>
      </div>
      <ArchivosChecklist archivos={evento.archivos} />
    </div>
  );
}

// Módulo admin: alta de fechas del calendario, y (a futuro) subida de
// los archivos de resultados de cada evento. Requiere las policies de
// insert/update de la migración 0004.
export default function GestionEventos() {
  const { eventos, loading, error, recargar } = useEventos();

  return (
    <div>
      <NuevaFecha onCreado={recargar} />

      {loading && <div style={{ color: T.muted, fontSize: 13 }}>Cargando calendario...</div>}
      {error && <div style={{ color: T.red, fontSize: 13 }}>Error: {error.message}</div>}

      {!loading && !error && eventos.map((e) => <FilaEvento key={e.id} evento={e} />)}
    </div>
  );
}
