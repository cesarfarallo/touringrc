import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { T } from "../theme";
import { useCampeonatos } from "../hooks";
import { supabase } from "../lib/supabase";

function NuevoCampeonato({ onCreado }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function crear(e) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase.from("campeonatos").insert({
      nombre: nombre.trim(),
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
    });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNombre("");
    setFechaInicio("");
    setFechaFin("");
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
        <Plus size={15} /> Agregar temporada
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
          placeholder="Metro Touring Eco 2027"
          required
          autoFocus
          style={{
            background: T.surfaceRaised,
            border: `1px solid ${T.line}`,
            borderRadius: 8,
            padding: "8px 12px",
            color: T.text,
            fontSize: 13,
            minWidth: 220,
          }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 11, color: T.muted }}>Desde</label>
        <input
          type="date"
          value={fechaInicio}
          onChange={(e) => setFechaInicio(e.target.value)}
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
        <label style={{ fontSize: 11, color: T.muted }}>Hasta</label>
        <input
          type="date"
          value={fechaFin}
          onChange={(e) => setFechaFin(e.target.value)}
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

function FilaCampeonato({ campeonato, esVigente, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(campeonato.nombre);
  const [fechaInicio, setFechaInicio] = useState(campeonato.fecha_inicio ?? "");
  const [fechaFin, setFechaFin] = useState(campeonato.fecha_fin ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function guardar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase
      .from("campeonatos")
      .update({ nombre: nombre.trim(), fecha_inicio: fechaInicio || null, fecha_fin: fechaFin || null })
      .eq("id", campeonato.id);
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditando(false);
    onGuardado();
  }

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, marginBottom: 10 }}>
      {!editando ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "Oswald, sans-serif", fontSize: 16, fontWeight: 600 }}>
              {campeonato.nombre}
              {esVigente && (
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    color: T.amber,
                    border: `1px solid ${T.amber}66`,
                    borderRadius: 6,
                    padding: "2px 6px",
                  }}
                >
                  Vigente
                </span>
              )}
            </div>
            <div style={{ color: T.muted, fontSize: 12, marginTop: 4, fontFamily: "JetBrains Mono, monospace" }}>
              {campeonato.fecha_inicio && campeonato.fecha_fin
                ? `${new Date(campeonato.fecha_inicio).toLocaleDateString("es-AR")} al ${new Date(campeonato.fecha_fin).toLocaleDateString("es-AR")}`
                : "Sin fechas cargadas"}
            </div>
          </div>
          <button
            onClick={() => setEditando(true)}
            title="Editar temporada"
            style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${T.line}`, borderRadius: 8, padding: "7px 12px", color: T.text, fontSize: 12, cursor: "pointer" }}
          >
            <Pencil size={12} /> Editar
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: T.muted }}>Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
              style={{ background: T.surfaceRaised, border: `1px solid ${T.line}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 13, minWidth: 220 }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: T.muted }}>Desde</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              style={{ background: T.surfaceRaised, border: `1px solid ${T.line}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: T.muted }}>Hasta</label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              style={{ background: T.surfaceRaised, border: `1px solid ${T.line}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}
            />
          </div>
          <button onClick={guardar} disabled={guardando} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: T.amber, color: "#1A1300", fontSize: 13, fontWeight: 600, cursor: guardando ? "default" : "pointer" }}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <button onClick={() => setEditando(false)} style={{ border: "none", background: "transparent", color: T.muted, fontSize: 13, cursor: "pointer" }}>
            Cancelar
          </button>
          {error && <div style={{ width: "100%", color: T.red, fontSize: 12 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}

// CRUD de temporadas/campeonatos -- da de alta cada año del torneo con su
// fecha_inicio/fecha_fin, para que el Calendario público pueda filtrar por
// "temporada vigente" (la de fecha_inicio más reciente, mismo criterio que
// useCampeonato()) y "Resultados históricos" pueda listar años anteriores.
export default function CampeonatosAdmin() {
  const { campeonatos, loading, error, recargar } = useCampeonatos();
  const vigenteId = campeonatos[0]?.id;

  return (
    <div>
      <NuevoCampeonato onCreado={recargar} />
      {loading && <div style={{ color: T.muted, fontSize: 13 }}>Cargando temporadas...</div>}
      {error && <div style={{ color: T.red, fontSize: 13 }}>Error: {error.message}</div>}
      {!error &&
        campeonatos.map((c) => (
          <FilaCampeonato key={c.id} campeonato={c} esVigente={c.id === vigenteId} onGuardado={recargar} />
        ))}
    </div>
  );
}
