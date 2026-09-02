import { useState } from "react";
import { Check, X, Pencil } from "lucide-react";
import { T } from "../theme";
import { usePilotos, useRolesYModulos, usePilotoRoles } from "../hooks";
import { supabase } from "../lib/supabase";
import VinculosPendientes from "./VinculosPendientes";

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
          style={{ border: "none", background: "transparent", color: T.muted, fontSize: 11, cursor: "pointer" }}
        >
          Cancelar
        </button>
      </div>
      {error && <div style={{ color: T.red, fontSize: 11 }}>{error}</div>}
    </div>
  );
}

function RolChip({ nombre, marcado, onToggle, disabled }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      style={{
        padding: "3px 9px",
        borderRadius: 20,
        border: `1px solid ${marcado ? T.amber : T.line}`,
        background: marcado ? `${T.amber}18` : "transparent",
        color: marcado ? T.amber : T.muted,
        fontSize: 11,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {nombre}
    </button>
  );
}

// Auditoría + gestión de pilotos: email editable a mano, roles
// asignables por chip, y un filtro para enfocarse en los que todavía
// no tienen ninguna cuenta vinculada (para completarles el email de
// antemano y que el próximo login los matchee solo). Incluye arriba
// la cola de logins ambiguos/duplicados a confirmar o fusionar.
export default function PilotosAdmin() {
  const { pilotos, loading, error, recargar } = usePilotos();
  const { roles } = useRolesYModulos(true);
  const { porPiloto, recargar: recargarRoles } = usePilotoRoles(true);
  const [trabajandoRol, setTrabajandoRol] = useState(null);
  const [soloSinVincular, setSoloSinVincular] = useState(false);

  async function toggleRol(pilotoId, rolId) {
    const clave = `${pilotoId}:${rolId}`;
    setTrabajandoRol(clave);
    const tiene = porPiloto[pilotoId]?.has(rolId);
    if (tiene) {
      await supabase.from("piloto_roles").delete().eq("piloto_id", pilotoId).eq("rol_id", rolId);
    } else {
      await supabase.from("piloto_roles").insert({ piloto_id: pilotoId, rol_id: rolId });
    }
    setTrabajandoRol(null);
    recargarRoles();
  }

  const visibles = soloSinVincular ? pilotos.filter((p) => !p.auth_user_id) : pilotos;

  return (
    <div>
      <VinculosPendientes />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ color: T.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5 }}>Pilotos</div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted, cursor: "pointer" }}>
          <input type="checkbox" checked={soloSinVincular} onChange={(e) => setSoloSinVincular(e.target.checked)} />
          Solo sin vincular
        </label>
      </div>

      {loading && <div style={{ color: T.muted, fontSize: 13 }}>Cargando pilotos...</div>}
      {error && <div style={{ color: T.red, fontSize: 13 }}>Error: {error.message}</div>}

      {!loading && !error && (
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.line}` }}>
                {["Nombre", "Email", "Roles", "Vinculado"].map((h) => (
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
              {visibles.map((p) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                  <td style={{ padding: "10px 16px", fontFamily: "Inter, sans-serif", fontSize: 13 }}>
                    {[p.first_name, p.last_name].filter(Boolean).join(" ") || "(sin nombre)"}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <EmailEditable piloto={p} onGuardado={recargar} />
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 260 }}>
                      {roles.map((r) => (
                        <RolChip
                          key={r.id}
                          nombre={r.nombre}
                          marcado={!!porPiloto[p.id]?.has(r.id)}
                          disabled={trabajandoRol === `${p.id}:${r.id}`}
                          onToggle={() => toggleRol(p.id, r.id)}
                        />
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    {p.auth_user_id ? <Check size={14} color={T.teal} /> : <X size={14} color={T.red} />}
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: "16px", color: T.muted, fontSize: 13 }}>
                    {soloSinVincular ? "Todos los pilotos ya están vinculados." : "Todavía no hay pilotos cargados."}
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
