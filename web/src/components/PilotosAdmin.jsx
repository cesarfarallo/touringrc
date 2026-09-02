import { useState } from "react";
import { Check, X, Pencil } from "lucide-react";
import { T } from "../theme";
import { usePilotos } from "../hooks";
import { supabase } from "../lib/supabase";

function EmailEditable({ piloto, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(piloto.email ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { error } = await supabase
      .from("pilotos")
      .update({ email: valor.trim() || null })
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
          setValor(piloto.email ?? "");
          setEditando(true);
        }}
        title="Editar email a mano"
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
        {piloto.email ?? "—"} <Pencil size={11} />
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="email"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardar();
            if (e.key === "Escape") setEditando(false);
          }}
          autoFocus
          style={{
            background: T.surfaceRaised,
            border: `1px solid ${T.line}`,
            borderRadius: 6,
            padding: "4px 8px",
            color: T.text,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
            width: 180,
          }}
        />
        <button
          onClick={guardar}
          disabled={guardando}
          style={{
            border: "none",
            background: `${T.teal}22`,
            color: T.teal,
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            cursor: guardando ? "default" : "pointer",
          }}
        >
          {guardando ? "..." : "Guardar"}
        </button>
        <button
          onClick={() => setEditando(false)}
          style={{
            border: "none",
            background: "transparent",
            color: T.muted,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
      {error && <div style={{ color: T.red, fontSize: 11 }}>{error}</div>}
    </div>
  );
}

// Auditoría rápida: todos los pilotos con su email y si tienen o no una
// cuenta vinculada. El email se puede editar a mano (ej. si el trigger
// vinculó a alguien con un email desactualizado, o para completar el de
// un piloto que todavía no se logueó nunca) -- permitido por la policy
// "admin corrige pilotos" de la migración 0002.
export default function PilotosAdmin() {
  const { pilotos, loading, error, recargar } = usePilotos();

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
        Pilotos — auditoría de login (admin)
      </div>

      {loading && <div style={{ color: T.muted, fontSize: 13 }}>Cargando pilotos...</div>}
      {error && <div style={{ color: T.red, fontSize: 13 }}>Error: {error.message}</div>}

      {!loading && !error && (
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.line}` }}>
                {["Nombre", "Email", "Vinculado"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "10px 16px",
                      fontFamily: "Inter, sans-serif",
                      fontSize: 11,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: T.muted,
                      fontWeight: 600,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pilotos.map((p) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                  <td style={{ padding: "10px 16px", fontFamily: "Inter, sans-serif", fontSize: 13 }}>
                    {[p.first_name, p.last_name].filter(Boolean).join(" ") || "(sin nombre)"}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <EmailEditable piloto={p} onGuardado={recargar} />
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    {p.auth_user_id ? <Check size={14} color={T.teal} /> : <X size={14} color={T.red} />}
                  </td>
                </tr>
              ))}
              {pilotos.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: "16px", color: T.muted, fontSize: 13 }}>
                    Todavía no hay pilotos cargados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
