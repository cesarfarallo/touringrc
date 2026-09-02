import { useState } from "react";
import { Check } from "lucide-react";
import { T } from "../theme";
import { useRolesYModulos } from "../hooks";
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
export default function RolesAdmin() {
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
    <div>
      <div style={{ color: T.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
        Qué sección puede ver cada rol
      </div>
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
    </div>
  );
}
