import { useState, useEffect } from "react";
import { Calendar, Trophy, Flag, User, Shield, Lock, Plus, Clock, ChevronRight, Zap, Check, X } from "lucide-react";

// ---------------------------------------------------------------
// Tokens de diseño
// Paleta: asfalto de noche + luces de largada (start lights)
// Tipografía: display condensada (carácter de pista), utilitaria
// monoespaciada para todo dato numérico (tiempos, posiciones, puntos)
// ---------------------------------------------------------------
const T = {
  bg: "#15181A",
  surface: "#1D2124",
  surfaceRaised: "#242829",
  line: "rgba(255,255,255,0.08)",
  text: "#F3F1EA",
  muted: "#8B9296",
  amber: "#FFB400",
  teal: "#3A9C92",
  red: "#E2574C",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
`;

// ---------------------------------------------------------------
// Datos reales del club (extraídos de los reportes de LiveTime que
// ya analizamos) — se usan acá como muestra para el skeleton
// ---------------------------------------------------------------
// Tipos de archivo que se esperan por cada fecha corrida, en el orden en
// que normalmente se exportan de LiveTime. 'clave' matchea con el objeto
// 'archivos' de cada evento.
const TIPOS_ARCHIVO = [
  { clave: "pilotos", label: "Pilotos", archivo: "GenericImport.csv" },
  { clave: "resultadosFinales", label: "Resultados finales", archivo: "FinalResults.xls" },
  { clave: "detalleRondas", label: "Detalle de rondas", archivo: "RoundResult-*.xls" },
  { clave: "vueltaRapida", label: "Vuelta rápida", archivo: "RoundTopTimes-*.xls" },
  { clave: "campeonato", label: "Campeonato", archivo: "SeriesResultReport.xls" },
];

const EVENTOS = [
  {
    id: 1,
    nombre: "Fecha 5",
    fecha: "2026-06-06",
    clase: "Touring Eco",
    inscripcionAbierta: false,
    corrida: true,
    archivos: { pilotos: true, resultadosFinales: true, detalleRondas: true, vueltaRapida: true, campeonato: true },
  },
  {
    id: 2,
    nombre: "Fecha 6",
    fecha: "2026-07-18",
    clase: "Touring Eco",
    inscripcionAbierta: false,
    corrida: true,
    archivos: { pilotos: true, resultadosFinales: true, detalleRondas: false, vueltaRapida: false, campeonato: true },
  },
  {
    id: 3,
    nombre: "Fecha 7",
    fecha: "2026-08-08",
    clase: "Touring Eco",
    inscripcionAbierta: false,
    corrida: true,
    archivos: { pilotos: true, resultadosFinales: true, detalleRondas: true, vueltaRapida: true, campeonato: false },
  },
  { id: 4, nombre: "Fecha 8", fecha: "2026-09-12", clase: "Touring Eco", inscripcionAbierta: true, corrida: false },
  { id: 5, nombre: "Fecha 9", fecha: "2026-10-10", clase: "Touring Eco", inscripcionAbierta: false, corrida: false },
];

// Resultados finales por evento corrido (evento.id -> clase -> filas).
// En producción esto sale de la tabla `resultados_finales` filtrada por evento_id.
const RESULTADOS_POR_EVENTO = {
  1: {
    "Touring Eco 1:10 Modified": [
      { pos: 1, piloto: "Agustin Marcolongo", resultado: "25/10:09.112", heat: "A Final", tq: true },
      { pos: 2, piloto: "Mariano Marcolongo", resultado: "25/10:11.430", heat: "A Final" },
      { pos: 3, piloto: "Diego Pezzotti", resultado: "25/10:12.887", heat: "A Final" },
    ],
    "Touring Eco 1:10 Stock": [
      { pos: 1, piloto: "Daniel Azuri", resultado: "23/10:19.554", heat: "A Final", tq: true },
      { pos: 2, piloto: "Pablo Suarez", resultado: "23/10:25.108", heat: "A Final" },
    ],
  },
  2: {
    "Touring Eco 1:10 Modified": [
      { pos: 1, piloto: "Mariano Marcolongo", resultado: "26/10:08.774", heat: "A Final", tq: true },
      { pos: 2, piloto: "Bruno Bonetta", resultado: "26/10:10.021", heat: "A Final" },
      { pos: 3, piloto: "Agustin Marcolongo", resultado: "25/10:13.665", heat: "A Final" },
    ],
    "Touring Eco 1:10 Stock": [
      { pos: 1, piloto: "Pablo Suarez", resultado: "24/10:30.442", heat: "A Final", tq: true },
      { pos: 2, piloto: "Martin Orce", resultado: "23/10:18.900", heat: "A Final" },
    ],
  },
  3: {
    "Touring Eco 1:10 Modified": [
      { pos: 1, piloto: "Mariano Marcolongo", resultado: "26/10:13.500", heat: "A Final" },
      { pos: 2, piloto: "Damian Martin", resultado: "26/10:14.162", heat: "A Final" },
      { pos: 3, piloto: "Agustin Marcolongo", resultado: "26/10:15.800", heat: "A Final" },
      { pos: 4, piloto: "Bruno Bonetta", resultado: "26/10:13.919", heat: "A Final", tq: true },
      { pos: 5, piloto: "Diego Pezzotti", resultado: "26/10:20.165", heat: "A Final" },
      { pos: 6, piloto: "Marcos Corbani", resultado: "26/10:16.310", heat: "A Final", vueltaRapida: true },
    ],
    "Touring Eco 1:10 Stock": [
      { pos: 1, piloto: "Pablo Suarez", resultado: "24/10:44.972", heat: "A Final" },
      { pos: 2, piloto: "Daniel Azuri", resultado: "23/10:27.896", heat: "A Final", tq: true },
      { pos: 3, piloto: "Bruno Calens", resultado: "23/10:32.219", heat: "A Final" },
      { pos: 4, piloto: "Martin Orce", resultado: "22/10:10.035", heat: "A Final" },
      { pos: 5, piloto: "Chocho Buratti", resultado: "23/10:38.442", heat: "A Final", vueltaRapida: true },
    ],
  },
};

const CAMPEONATO = {
  "Touring Eco 1:10 Modified": [
    { pos: 1, piloto: "Mariano Marcolongo", puntos: 243, tqs: 1, wins: 2, eventos: 6 },
    { pos: 2, piloto: "Diego Pezzotti", puntos: 232, tqs: 2, wins: 1, eventos: 7 },
    { pos: 3, piloto: "Agustin Marcolongo", puntos: 230, tqs: 0, wins: 1, eventos: 7 },
  ],
  "Touring Eco 1:10 Stock": [
    { pos: 1, piloto: "Pablo Suarez", puntos: 251, tqs: 3, wins: 3, eventos: 7 },
    { pos: 2, piloto: "Daniel Azuri", puntos: 224, tqs: 2, wins: 1, eventos: 6 },
  ],
};

// ---------------------------------------------------------------
// Signature element: semáforo de largada, usado como cuenta
// regresiva a la próxima fecha del calendario
// ---------------------------------------------------------------
function StartLights({ diasRestantes }) {
  const encendidas = Math.max(0, 5 - Math.min(5, Math.ceil(diasRestantes / 6)));
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: i < encendidas ? T.amber : "transparent",
            border: `2px solid ${i < encendidas ? T.amber : T.line}`,
            boxShadow: i < encendidas ? `0 0 14px ${T.amber}99` : "none",
            transition: "all 0.4s ease",
          }}
        />
      ))}
    </div>
  );
}

function NavTab({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        borderRadius: 8,
        border: "none",
        background: active ? T.surfaceRaised : "transparent",
        color: active ? T.amber : T.muted,
        fontFamily: "Inter, sans-serif",
        fontWeight: 600,
        fontSize: 14,
        cursor: "pointer",
        transition: "all 0.2s",
      }}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function ArchivosChecklist({ archivos }) {
  if (!archivos) return null;
  const faltantes = TIPOS_ARCHIVO.filter((t) => !archivos[t.clave]);
  const completo = faltantes.length === 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
      {TIPOS_ARCHIVO.map((t) => {
        const ok = !!archivos[t.clave];
        return (
          <span
            key={t.clave}
            title={`${t.label} (${t.archivo}) ${ok ? "— cargado" : "— falta subir"}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: ok ? `${T.teal}22` : `${T.red}18`,
              border: `1px solid ${ok ? T.teal : T.red}55`,
              cursor: "default",
            }}
          >
            {ok ? <Check size={11} color={T.teal} /> : <X size={11} color={T.red} />}
          </span>
        );
      })}
      <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: completo ? T.teal : T.red, marginLeft: 2 }}>
        {completo ? "Completo" : `Faltan ${faltantes.length}: ${faltantes.map((f) => f.label).join(", ")}`}
      </span>
    </div>
  );
}

function EventoCard({ evento, esAdmin, onVerResultados }) {
  const fecha = new Date(evento.fecha + "T00:00:00");
  const fechaStr = fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderRadius: 12,
        padding: 20,
        display: "flex",
        justifyContent: "space-between",
        alignItems: esAdmin && evento.corrida ? "flex-start" : "center",
      }}
    >
      <div>
        <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 20, fontWeight: 600, letterSpacing: 0.3 }}>
          {evento.nombre}
        </div>
        <div style={{ color: T.muted, fontSize: 13, marginTop: 4, fontFamily: "Inter, sans-serif" }}>
          {fechaStr} · {evento.clase}
        </div>
        {esAdmin && evento.corrida && <ArchivosChecklist archivos={evento.archivos} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {esAdmin && (
          <span
            style={{
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace",
              padding: "4px 10px",
              borderRadius: 20,
              background: evento.inscripcionAbierta ? `${T.teal}22` : `${T.muted}22`,
              color: evento.inscripcionAbierta ? T.teal : T.muted,
              border: `1px solid ${evento.inscripcionAbierta ? T.teal : T.line}`,
            }}
          >
            {evento.inscripcionAbierta ? "INSCRIPCIÓN ABIERTA" : "INSCRIPCIÓN CERRADA"}
          </span>
        )}
        {evento.corrida ? (
          <button
            onClick={() => onVerResultados(evento.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${T.line}`,
              background: "transparent",
              color: T.text,
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Ver resultados <ChevronRight size={14} />
          </button>
        ) : (
          <button
            disabled={!evento.inscripcionAbierta}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: evento.inscripcionAbierta ? T.amber : T.surfaceRaised,
              color: evento.inscripcionAbierta ? "#1A1300" : T.muted,
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              fontWeight: 600,
              cursor: evento.inscripcionAbierta ? "pointer" : "not-allowed",
            }}
          >
            {evento.inscripcionAbierta ? "Inscribirme" : "Cerrada"}
          </button>
        )}
      </div>
    </div>
  );
}

function TablaResultados({ data }) {
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
            <tr key={r.piloto} style={{ borderBottom: `1px solid ${T.line}` }}>
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

function TablaCampeonato({ data }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
            <tr key={r.piloto} style={{ borderBottom: `1px solid ${T.line}` }}>
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
              <td style={{ padding: "12px 16px", fontFamily: "Inter, sans-serif", fontWeight: 500 }}>{r.piloto}</td>
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
  );
}

export default function TouringRCApp() {
  const [tab, setTab] = useState("calendario");
  const [clase, setClase] = useState("Touring Eco 1:10 Modified");
  const [logueado, setLogueado] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);

  const eventosCorridos = EVENTOS.filter((e) => e.corrida).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const [eventoResultadosId, setEventoResultadosId] = useState(eventosCorridos[0]?.id);
  const eventoResultados = EVENTOS.find((e) => e.id === eventoResultadosId);

  const proximo = EVENTOS.find((e) => !e.corrida);
  const dias = proximo
    ? Math.ceil((new Date(proximo.fecha) - new Date("2026-08-12")) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.text, fontFamily: "Inter, sans-serif" }}>
      <style>{FONTS}</style>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${T.line}`, background: T.surface }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Flag size={20} color={T.amber} />
            <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 19, fontWeight: 700, letterSpacing: 0.5 }}>
              TOURING RC
            </span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <NavTab icon={Calendar} label="Calendario" active={tab === "calendario"} onClick={() => setTab("calendario")} />
            <NavTab icon={Flag} label="Resultados" active={tab === "resultados"} onClick={() => setTab("resultados")} />
            <NavTab icon={Trophy} label="Campeonato" active={tab === "campeonato"} onClick={() => setTab("campeonato")} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {logueado && (
              <button
                onClick={() => setEsAdmin(!esAdmin)}
                title="Alternar modo admin (demo)"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: `1px solid ${esAdmin ? T.amber : T.line}`,
                  background: esAdmin ? `${T.amber}18` : "transparent",
                  color: esAdmin ? T.amber : T.muted,
                  fontSize: 11,
                  fontFamily: "JetBrains Mono, monospace",
                  cursor: "pointer",
                }}
              >
                <Shield size={12} /> ADMIN
              </button>
            )}
            <button
              onClick={() => setLogueado(!logueado)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${T.line}`,
                background: T.surfaceRaised,
                color: T.text,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <User size={14} />
              {logueado ? "Bruno Bonetta" : "Ingresar"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        {!logueado && tab === "calendario" && (
          <div
            style={{
              marginBottom: 24,
              padding: "12px 16px",
              borderRadius: 8,
              background: `${T.teal}15`,
              border: `1px solid ${T.teal}40`,
              fontSize: 13,
              color: T.teal,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Lock size={14} /> Ingresá con Google o Apple para inscribirte a una fecha.
          </div>
        )}

        {tab === "calendario" && (
          <>
            {proximo && (
              <div
                style={{
                  background: T.surface,
                  border: `1px solid ${T.line}`,
                  borderRadius: 12,
                  padding: 28,
                  marginBottom: 28,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ color: T.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
                    Próxima fecha
                  </div>
                  <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 32, fontWeight: 700 }}>{proximo.nombre}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, color: T.muted, fontSize: 14 }}>
                    <Clock size={14} />
                    <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{dias} días</span>
                  </div>
                </div>
                <StartLights diasRestantes={dias} />
              </div>
            )}

            {esAdmin && (
              <button
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: `1px dashed ${T.amber}66`,
                  background: "transparent",
                  color: T.amber,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Plus size={15} /> Agregar fecha al calendario
              </button>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {EVENTOS.map((e) => (
                <EventoCard
                  key={e.id}
                  evento={e}
                  esAdmin={esAdmin}
                  onVerResultados={(id) => {
                    setEventoResultadosId(id);
                    setTab("resultados");
                  }}
                />
              ))}
            </div>
          </>
        )}

        {(tab === "resultados" || tab === "campeonato") && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {Object.keys(CAMPEONATO).map((c) => (
                <button
                  key={c}
                  onClick={() => setClase(c)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: `1px solid ${clase === c ? T.amber : T.line}`,
                    background: clase === c ? `${T.amber}18` : "transparent",
                    color: clase === c ? T.amber : T.muted,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {c.replace("Touring Eco 1:10 ", "")}
                </button>
              ))}
            </div>

            {tab === "resultados" ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <span style={{ color: T.muted, fontSize: 12, fontFamily: "Inter, sans-serif" }}>Fecha:</span>
                  <select
                    value={eventoResultadosId}
                    onChange={(e) => setEventoResultadosId(Number(e.target.value))}
                    style={{
                      background: T.surfaceRaised,
                      border: `1px solid ${T.line}`,
                      borderRadius: 8,
                      padding: "8px 12px",
                      color: T.text,
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {eventosCorridos.map((e) => {
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
                </div>
                {RESULTADOS_POR_EVENTO[eventoResultadosId]?.[clase] ? (
                  <TablaResultados data={RESULTADOS_POR_EVENTO[eventoResultadosId][clase]} />
                ) : (
                  <div style={{ color: T.muted, fontSize: 13, padding: "24px 0" }}>
                    No hay resultados de {clase.replace("Touring Eco 1:10 ", "")} en esta fecha.
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ color: T.muted, fontSize: 13, marginBottom: 12, fontFamily: "JetBrains Mono, monospace" }}>
                  TORNEO METRO TOURING ECO — 14/3/2026 al 31/12/2026
                </div>
                <TablaCampeonato data={CAMPEONATO[clase]} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
