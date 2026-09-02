import { useState } from "react";
import { Check } from "lucide-react";
import { T } from "../theme";
import { useRolesYModulos, usePilotoRoles, usePilotos } from "../hooks";
import { supabase } from "../lib/supabase";

function Checkbox({ marcado, onToggle, disabled, title }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onToggle}
      style={{
        width: 22,
        height: 22,
        borderRadius: 5,
        border: `1px solid ${marcado ? T.amber : T.line}`,
        background: marcado ? `${T.amber}22` : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        padding: 0,
      }}
    >
      {marcado && <Check size={13} color={T.amber} />}
    </button>
  );
}

// Matriz rol x módulo: tildá a qué pantallas/funciones tiene acceso
// cada rol. `admin` no se puede destildar de nada (siempre ve todo).
function MatrizRolModulos() {
  const { roles, modulos, rolModulos, loading, error, recargar } = useRolesYModulos(true);
  const [trabajando, setTrabajando] = useState(null);

  const tiene = (rolId, moduloId) => rolModulos.some((rm) => rm.rol_id === rolId && rm.modulo_id === moduloId);

  async function toggle(rolId, moduloId) {
    if (rolId === "admin") return;
    const clave = `${rolId}:${moduloId}`;
    setTrabajando(clave);
    if (tiene(rolId, moduloId)) {
      await supabase.from("rol_modulos").delete().eq("rol_id", rolId).eq("modulo_id", moduloId);
    } else {
      await supabase.from("rol_modulos").insert({ rol_id: rolId, modulo_id: moduloId });
    }
    setTrabajando(null);
    recargar();
  }

  if (loading) return <div style={{ color: T.muted, fontSize: 13 }}>Cargando...</div>;
  if (error) return <div style={{ color: T.red, fontSize: 13 }}>Error: {error.message}</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "6px 10px", color: T.muted, fontWeight: 600 }}>Módulo</th>
            {roles.map((r) => (
              <th key={r.id} style={{ padding: "6px 10px", color: T.muted, fontWeight: 600, whiteSpace: "nowrap" }}>
                {r.nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modulos.map((m) => (
            <tr key={m.id} style={{ borderTop: `1px solid ${T.line}` }}>
              <td style={{ padding: "6px 10px", fontFamily: "Inter, sans-serif" }} title={m.descripcion ?? ""}>
                {m.nombre}
              </td>
              {roles.map((r) => (
                <td key={r.id} style={{ padding: "6px 10px", textAlign: "center" }}>
                  <Checkbox
                    marcado={r.id === "admin" ? true : tiene(r.id, m.id)}
                    disabled={r.id === "admin" || trabajando === `${r.id}:${m.id}`}
                    onToggle={() => toggle(r.id, m.id)}
                    title={r.id === "admin" ? "Admin siempre tiene acceso a todo" : `${r.nombre} → ${m.nombre}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Lista de pilotos con chips de rol tildables -- quién es Técnica,
// Comisario, Cronometrista, etc.
function AsignacionDeRoles() {
  const { roles } = useRolesYModulos(true);
  const { pilotos, loading: cargandoPilotos } = usePilotos();
  const { porPiloto, loading: cargandoRoles, recargar } = usePilotoRoles(true);
  const [trabajando, setTrabajando] = useState(null);

  async function toggle(pilotoId, rolId) {
    const clave = `${pilotoId}:${rolId}`;
    setTrabajando(clave);
    const tiene = porPiloto[pilotoId]?.has(rolId);
    if (tiene) {
      await supabase.from("piloto_roles").delete().eq("piloto_id", pilotoId).eq("rol_id", rolId);
    } else {
      await supabase.from("piloto_roles").insert({ piloto_id: pilotoId, rol_id: rolId });
    }
    setTrabajando(null);
    recargar();
  }

  if (cargandoPilotos || cargandoRoles) return <div style={{ color: T.muted, fontSize: 13 }}>Cargando...</div>;

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.line}` }}>
            <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, textTransform: "uppercase", color: T.muted }}>
              Piloto
            </th>
            {roles.map((r) => (
              <th
                key={r.id}
                style={{ padding: "10px 8px", fontSize: 11, textTransform: "uppercase", color: T.muted, whiteSpace: "nowrap" }}
              >
                {r.nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pilotos.map((p) => (
            <tr key={p.id} style={{ borderBottom: `1px solid ${T.line}` }}>
              <td style={{ padding: "8px 16px", fontFamily: "Inter, sans-serif", fontSize: 13 }}>
                {[p.first_name, p.last_name].filter(Boolean).join(" ") || "(sin nombre)"}
              </td>
              {roles.map((r) => (
                <td key={r.id} style={{ padding: "8px", textAlign: "center" }}>
                  <Checkbox
                    marcado={!!porPiloto[p.id]?.has(r.id)}
                    disabled={trabajando === `${p.id}:${r.id}`}
                    onToggle={() => toggle(p.id, r.id)}
                    title={`${r.nombre}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RolesAdmin() {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ color: T.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
        Roles: qué módulo ve cada rol
      </div>
      <div style={{ marginBottom: 20 }}>
        <MatrizRolModulos />
      </div>

      <div style={{ color: T.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
        Roles: qué rol tiene cada piloto
      </div>
      <AsignacionDeRoles />
    </div>
  );
}
