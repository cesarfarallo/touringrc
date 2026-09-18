import { T } from "../theme";
import { useMarcaVigentePorPiloto, useFotosPilotos } from "../hooks";
import LogoMarca from "./LogoMarca";
import FotoPiloto from "./FotoPiloto";

export default function TablaCampeonato({ data, pilotoId }) {
  const marcasPorPiloto = useMarcaVigentePorPiloto();
  const fotosPorPiloto = useFotosPilotos();
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.line}` }}>
            {["Pos", "Piloto", "Puntos", "TQs", "Victorias", "Fechas"].map((h) => (
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
            <tr
              key={`${r.pos}-${r.piloto}`}
              style={{
                borderBottom: `1px solid ${T.line}`,
                background: r.pilotoId === pilotoId ? `${T.amber}18` : "transparent",
              }}
            >
              <td
                style={{
                  padding: "12px 16px",
                  fontFamily: "JetBrains Mono, monospace",
                  color: r.pos === 1 ? T.amber : T.text,
                  fontWeight: 700,
                }}
              >
                {r.pos}
              </td>
              <td style={{ padding: "12px 16px", fontFamily: "Inter, sans-serif", fontWeight: 500, color: r.pilotoId === pilotoId ? T.amber : T.text }}>
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  <FotoPiloto fotoUrl={fotosPorPiloto[r.pilotoId]} size={48} style={{ marginRight: 8 }} />
                  {r.piloto}
                  <LogoMarca marca={marcasPorPiloto[r.pilotoId]} style={{ marginLeft: 6 }} />
                </span>
              </td>
              <td style={{ padding: "12px 16px", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: T.amber }}>
                {r.puntos}
              </td>
              <td style={{ padding: "12px 16px", fontFamily: "JetBrains Mono, monospace", color: T.muted }}>{r.tqs}</td>
              <td style={{ padding: "12px 16px", fontFamily: "JetBrains Mono, monospace", color: T.muted }}>{r.wins}</td>
              <td style={{ padding: "12px 16px", fontFamily: "JetBrains Mono, monospace", color: T.muted }}>{r.eventos}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
