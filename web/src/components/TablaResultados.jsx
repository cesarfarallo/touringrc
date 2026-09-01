import { Zap } from "lucide-react";
import { T } from "../theme";

export default function TablaResultados({ data }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.line}` }}>
            {["Pos", "Piloto", "Resultado", "Heat"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "12px 16px",
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
          {data.map((r) => (
            <tr key={`${r.pos}-${r.piloto}`} style={{ borderBottom: `1px solid ${T.line}` }}>
              <td
                style={{
                  padding: "12px 16px",
                  fontFamily: "JetBrains Mono, monospace",
                  color: r.pos === 1 ? T.amber : T.text,
                  fontWeight: 600,
                }}
              >
                {r.pos}
              </td>
              <td style={{ padding: "12px 16px", fontFamily: "Inter, sans-serif" }}>
                {r.piloto}
                {r.tq && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      fontFamily: "JetBrains Mono, monospace",
                      color: T.amber,
                      border: `1px solid ${T.amber}55`,
                      borderRadius: 4,
                      padding: "1px 5px",
                    }}
                  >
                    TQ
                  </span>
                )}
                {r.vueltaRapida && (
                  <span
                    title="Vuelta rápida"
                    style={{
                      marginLeft: 6,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      fontSize: 10,
                      fontFamily: "JetBrains Mono, monospace",
                      color: T.teal,
                      border: `1px solid ${T.teal}55`,
                      borderRadius: 4,
                      padding: "1px 5px 1px 4px",
                    }}
                  >
                    <Zap size={10} fill={T.teal} />
                    VR
                  </span>
                )}
              </td>
              <td style={{ padding: "12px 16px", fontFamily: "JetBrains Mono, monospace", color: T.muted }}>
                {r.resultado}
              </td>
              <td style={{ padding: "12px 16px", fontFamily: "Inter, sans-serif", color: T.muted, fontSize: 13 }}>
                {r.heat}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
