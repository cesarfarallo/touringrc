import { useMemo, useState } from "react";
import { T } from "../theme";
import { useCampeonatos, useEventos, useResultadosEvento, useClasificacionEvento, useCampeonato } from "../hooks";
import TablaResultados from "./TablaResultados";
import TablaClasificacion from "./TablaClasificacion";
import TablaCampeonato from "./TablaCampeonato";

function SelectorClase({ clases, activa, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      {clases.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: `1px solid ${activa === c ? T.amber : T.line}`,
            background: activa === c ? `${T.amber}18` : "transparent",
            color: activa === c ? T.amber : T.muted,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {c.replace("Touring Eco 1:10 ", "")}
        </button>
      ))}
    </div>
  );
}

// Único lugar de la app donde se navegan temporadas anteriores -- desde la
// migración 0022, Calendario/Resultados/Campeonato solo muestran la
// temporada vigente. Acá se elige un campeonato primero y recién ahí se
// arman los dos módulos de siempre (resultados de eventos + standings del
// campeonato) para ese año puntual, reutilizando los mismos hooks/tablas
// del resto de la app.
export default function ResultadosHistoricos({ pilotoId }) {
  const { campeonatos, loading: cargandoCampeonatos, error: errorCampeonatos } = useCampeonatos();
  const { eventos, loading: cargandoEventos } = useEventos();
  const [campeonatoId, setCampeonatoId] = useState("");

  const { campeonato, porClase: campeonatoPorClase, loading: cargandoStandings } = useCampeonato(campeonatoId);

  const eventosDelCampeonato = useMemo(() => {
    if (!campeonatoId) return [];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return eventos
      .filter((e) => e.campeonato_id === campeonatoId && (e.corrida || new Date(`${e.fecha}T00:00:00`) < hoy))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, [eventos, campeonatoId]);

  const [eventoId, setEventoId] = useState("");
  const eventoIdActivo =
    eventoId && eventosDelCampeonato.some((e) => e.id === eventoId) ? eventoId : eventosDelCampeonato[0]?.id;

  const [subTab, setSubTab] = useState("finales");
  const { porClase: resultadosPorClase, loading: cargandoResultados } = useResultadosEvento(eventoIdActivo);
  const { porClase: clasificacionPorClase, loading: cargandoClasificacion } = useClasificacionEvento(eventoIdActivo);

  const clasesResultados = Object.keys(subTab === "finales" ? resultadosPorClase : clasificacionPorClase);
  const [claseResultados, setClaseResultados] = useState(null);
  const claseResultadosActiva =
    claseResultados && clasesResultados.includes(claseResultados) ? claseResultados : clasesResultados[0];

  const clasesCampeonato = Object.keys(campeonatoPorClase);
  const [claseCampeonato, setClaseCampeonato] = useState(null);
  const claseCampeonatoActiva =
    claseCampeonato && clasesCampeonato.includes(claseCampeonato) ? claseCampeonato : clasesCampeonato[0];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", color: T.muted, fontSize: 12, marginBottom: 6 }}>
          Elegí una temporada
        </label>
        <select
          value={campeonatoId}
          onChange={(e) => {
            setCampeonatoId(e.target.value);
            setEventoId("");
          }}
          disabled={cargandoCampeonatos}
          style={{
            background: T.surfaceRaised,
            border: `1px solid ${T.line}`,
            borderRadius: 8,
            padding: "10px 14px",
            color: T.text,
            fontSize: 14,
            minWidth: 260,
          }}
        >
          <option value="">{cargandoCampeonatos ? "Cargando temporadas..." : "Seleccioná un campeonato..."}</option>
          {campeonatos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        {errorCampeonatos && (
          <div style={{ color: T.red, fontSize: 12, marginTop: 6 }}>Error: {errorCampeonatos.message}</div>
        )}
      </div>

      {!campeonatoId && (
        <div style={{ color: T.muted, fontSize: 13 }}>
          Elegí una temporada para ver sus resultados y el acumulado del campeonato.
        </div>
      )}

      {campeonatoId && (
        <>
          <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
              Resultados de eventos
            </div>
            {cargandoEventos && <div style={{ color: T.muted, fontSize: 13 }}>Cargando eventos...</div>}
            {!cargandoEventos && eventosDelCampeonato.length === 0 && (
              <div style={{ color: T.muted, fontSize: 13 }}>Esta temporada todavía no tiene fechas con resultados.</div>
            )}
            {!cargandoEventos && eventosDelCampeonato.length > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
                  <select
                    value={eventoIdActivo ?? ""}
                    onChange={(e) => setEventoId(e.target.value)}
                    style={{
                      background: T.surfaceRaised,
                      border: `1px solid ${T.line}`,
                      borderRadius: 8,
                      padding: "8px 12px",
                      color: T.text,
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 13,
                    }}
                  >
                    {eventosDelCampeonato.map((e) => {
                      const f = new Date(e.fecha + "T00:00:00").toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      });
                      return (
                        <option key={e.id} value={e.id}>
                          {e.nombre} — {f}
                        </option>
                      );
                    })}
                  </select>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[
                      { id: "finales", label: "Resultados finales" },
                      { id: "clasificacion", label: "Clasificación" },
                    ].map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSubTab(s.id)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: `1px solid ${subTab === s.id ? T.amber : T.line}`,
                          background: subTab === s.id ? `${T.amber}18` : "transparent",
                          color: subTab === s.id ? T.amber : T.muted,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <SelectorClase clases={clasesResultados} activa={claseResultadosActiva} onChange={setClaseResultados} />

                {subTab === "finales" ? (
                  <>
                    {cargandoResultados && <div style={{ color: T.muted, fontSize: 13 }}>Cargando resultados...</div>}
                    {!cargandoResultados && claseResultadosActiva && resultadosPorClase[claseResultadosActiva] ? (
                      <TablaResultados data={resultadosPorClase[claseResultadosActiva]} pilotoId={pilotoId} />
                    ) : (
                      !cargandoResultados && (
                        <div style={{ color: T.muted, fontSize: 13, padding: "12px 0" }}>
                          No hay resultados en esta fecha.
                        </div>
                      )
                    )}
                  </>
                ) : (
                  <>
                    {cargandoClasificacion && <div style={{ color: T.muted, fontSize: 13 }}>Cargando clasificación...</div>}
                    {!cargandoClasificacion && claseResultadosActiva && clasificacionPorClase[claseResultadosActiva] ? (
                      <TablaClasificacion data={clasificacionPorClase[claseResultadosActiva]} pilotoId={pilotoId} />
                    ) : (
                      !cargandoClasificacion && (
                        <div style={{ color: T.muted, fontSize: 13, padding: "12px 0" }}>
                          No hay clasificación en esta fecha.
                        </div>
                      )
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Campeonato</div>
            {campeonato?.fecha_inicio && campeonato?.fecha_fin && (
              <div style={{ color: T.muted, fontSize: 12, marginBottom: 12, fontFamily: "JetBrains Mono, monospace" }}>
                {new Date(campeonato.fecha_inicio).toLocaleDateString("es-AR")} al{" "}
                {new Date(campeonato.fecha_fin).toLocaleDateString("es-AR")}
              </div>
            )}
            {cargandoStandings && <div style={{ color: T.muted, fontSize: 13 }}>Cargando campeonato...</div>}
            {!cargandoStandings && clasesCampeonato.length === 0 && (
              <div style={{ color: T.muted, fontSize: 13 }}>Esta temporada todavía no tiene acumulado cargado.</div>
            )}
            {clasesCampeonato.length > 0 && (
              <>
                <SelectorClase clases={clasesCampeonato} activa={claseCampeonatoActiva} onChange={setClaseCampeonato} />
                {claseCampeonatoActiva && campeonatoPorClase[claseCampeonatoActiva] && (
                  <TablaCampeonato data={campeonatoPorClase[claseCampeonatoActiva]} pilotoId={pilotoId} />
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
