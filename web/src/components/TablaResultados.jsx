import { Zap, Trophy, Medal } from "lucide-react";
import { T } from "../theme";

const COLOR_PODIO = { 1: "#FFD700", 2: "#C0C0C0", 3: "#CD7F32" };

// Cuando un evento corre dos finales por clase (A y B), el top 3 de cada
// una se distingue con un ícono distinto: copa para la A, medalla para la
// B -- calculado por posición relativa DENTRO de cada heat (no la
// posición global de la tabla), así funciona igual si solo se corrió una
// final (todo bajo "A Final") o si hubo dos.
function calcularPodios(data) {
  const porHeat = {};
  for (const r of data) {
    const heat = (r.heat ?? "").trim();
    if (!heat) continue;
    (porHeat[heat] ??= []).push(r);
  }
  const podios = new Map();
  for (const filas of Object.values(porHeat)) {
    const heat = filas[0].heat.trim();
    const tipo = /^b/i.test(heat) ? "medalla" : /^a/i.test(heat) ? "copa" : null;
    if (!tipo) continue;
    [...filas]
      .sort((a, b) => a.pos - b.pos)
      .slice(0, 3)
      .forEach((r, i) => podios.set(`${r.pos}-${r.piloto}`, { tipo, lugar: i + 1 }));
  }
  return podios;
}

function IconoPodio({ tipo, lugar }) {
  const color = COLOR_PODIO[lugar];
  const Icono = tipo === "medalla" ? Medal : Trophy;
  return (
    <Icono
      size={15}
      color={color}
      fill={tipo === "copa" ? color : "none"}
      style={{ marginRight: 8, flexShrink: 0 }}
    />
  );
}

export default function TablaResultados({ data, pilotoId }) {
  const podios = calcularPodios(data);
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse" }}>
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
          {data.map((r) => {
            const podio = podios.get(`${r.pos}-${r.piloto}`);
            return (
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
                    fontWeight: 600,
                  }}
                >
                  {r.pos}
                </td>
                <td style={{ padding: "12px 16px", fontFamily: "Inter, sans-serif", display: "flex", alignItems: "center" }}>
                  {podio && <IconoPodio tipo={podio.tipo} lugar={podio.lugar} />}
                  <span style={{ color: r.pilotoId === pilotoId ? T.amber : T.text, fontWeight: r.pilotoId === pilotoId ? 700 : 400 }}>
                    {r.piloto}
                  </span>
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
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
