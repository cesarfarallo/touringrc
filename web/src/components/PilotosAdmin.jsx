import { Check, X } from "lucide-react";
import { T } from "../theme";
import { usePilotos } from "../hooks";

// Auditoría rápida: todos los pilotos con su email y si tienen o no una
// cuenta vinculada. `pilotos` es de lectura pública (RLS), así que esto no
// necesita ningún permiso especial -- ver la nota en usePilotos().
export default function PilotosAdmin() {
  const { pilotos, loading, error } = usePilotos();

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
                  <td style={{ padding: "10px 16px", fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: T.muted }}>
                    {p.email ?? "—"}
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
