import { useState } from "react";
import { Pencil } from "lucide-react";
import { T } from "../theme";
import { supabase } from "../lib/supabase";

// Edición inline de nombre/apellido de un piloto -- compartido entre
// PilotosAdmin.jsx (cualquier piloto) y VinculosPendientes.jsx (corregir
// a mano el piloto que se creó automáticamente en un login, antes de
// confirmarlo o en vez de confirmarlo).
export default function NombreEditable({ piloto, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(piloto.first_name ?? "");
  const [apellido, setApellido] = useState(piloto.last_name ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function guardar() {
    if (!nombre.trim() || !apellido.trim()) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase
      .from("pilotos")
      .update({ first_name: nombre.trim(), last_name: apellido.trim() })
      .eq("id", piloto.id);
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
          setNombre(piloto.first_name ?? "");
          setApellido(piloto.last_name ?? "");
          setEditando(true);
        }}
        title="Editar nombre y apellido"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "none",
          color: T.text,
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          cursor: "pointer",
          padding: 0,
          textAlign: "left",
        }}
      >
        {[piloto.first_name, piloto.last_name].filter(Boolean).join(" ") || "(sin nombre)"}
        <Pencil size={11} color={T.muted} />
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre"
          autoFocus
          style={{
            background: T.surfaceRaised,
            border: `1px solid ${T.line}`,
            borderRadius: 6,
            padding: "4px 8px",
            color: T.text,
            fontSize: 12,
            width: 100,
          }}
        />
        <input
          value={apellido}
          onChange={(e) => setApellido(e.target.value)}
          placeholder="Apellido"
          style={{
            background: T.surfaceRaised,
            border: `1px solid ${T.line}`,
            borderRadius: 6,
            padding: "4px 8px",
            color: T.text,
            fontSize: 12,
            width: 100,
          }}
        />
        <button
          onClick={guardar}
          disabled={guardando}
          style={{ border: "none", background: `${T.teal}22`, color: T.teal, borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: guardando ? "default" : "pointer" }}
        >
          {guardando ? "..." : "Guardar"}
        </button>
        <button
          onClick={() => setEditando(false)}
          style={{ border: "none", background: "transparent", color: T.muted, fontSize: 11, cursor: "pointer" }}
        >
          Cancelar
        </button>
      </div>
      {error && <div style={{ color: T.red, fontSize: 11 }}>{error}</div>}
    </div>
  );
}
