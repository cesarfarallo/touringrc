import { T } from "../theme";

export default function TablaClasificacion({ data }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.line}` }}>
            {["Pos", "Piloto", "Resultado", "Rondas", "Desempate"].map((h) => (
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
              <td style={{ padding: "12px 16px", fontFamily: "Inter, sans-serif" }}>{r.piloto}</td>
              <td style={{ padding: "12px 16px", fontFamily: "JetBrains Mono, monospace", color: T.muted }}>
                {r.resultado}
              </td>
              <td style={{ padding: "12px 16px", fontFamily: "JetBrains Mono, monospace", color: T.muted, fontSize: 12, whiteSpace: "nowrap" }}>
                {r.rondas.join("  ·  ")}
              </td>
              <td style={{ padding: "12px 16px", fontFamily: "JetBrains Mono, monospace", color: T.muted, fontSize: 11, whiteSpace: "nowrap" }}>
                {r.tieBreaker}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
