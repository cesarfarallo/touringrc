import { useMemo, useState } from "react";
import { Calendar, Trophy, Flag, User, ShieldCheck, Clock, AlertTriangle } from "lucide-react";
import { T, FONTS } from "./theme";
import { useEventos, useResultadosEvento, useCampeonato, useSession, usePilotoActual, useEsAdmin } from "./hooks";
import { supabase } from "./lib/supabase";
import NavTab from "./components/NavTab";
import StartLights from "./components/StartLights";
import EventoCard from "./components/EventoCard";
import TablaResultados from "./components/TablaResultados";
import TablaCampeonato from "./components/TablaCampeonato";
import LoginCard from "./components/LoginCard";
import MiPerfil from "./components/MiPerfil";
import AdminPanel from "./components/AdminPanel";
import DevRibbon from "./components/DevRibbon";

function nombreParaMostrar(piloto, session) {
  const nombre = [piloto?.first_name, piloto?.last_name].filter(Boolean).join(" ");
  return nombre || session?.user?.email || "Piloto";
}

export default function TouringRCApp() {
  const [tab, setTab] = useState("calendario");
  const { session } = useSession();
  const { piloto, loading: cargandoPiloto } = usePilotoActual(session);
  const logueado = !!session;
  const { esAdmin: esAdminReal } = useEsAdmin(session);

  const { eventos, loading: cargandoEventos, error: errorEventos } = useEventos();
  const { campeonato, porClase: campeonatoPorClase, loading: cargandoCampeonato, error: errorCampeonato } = useCampeonato();

  const clases = Object.keys(campeonatoPorClase);
  const [clase, setClase] = useState(null);
  const claseActiva = clase && clases.includes(clase) ? clase : clases[0];

  const eventosCorridos = useMemo(
    () => [...eventos].filter((e) => e.corrida).sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
    [eventos]
  );
  const [eventoResultadosId, setEventoResultadosId] = useState(null);
  const eventoResultadosIdActivo =
    eventoResultadosId && eventosCorridos.some((e) => e.id === eventoResultadosId)
      ? eventoResultadosId
      : eventosCorridos[0]?.id;

  const {
    porClase: resultadosPorClase,
    loading: cargandoResultados,
    error: errorResultados,
  } = useResultadosEvento(eventoResultadosIdActivo);

  const proximo = eventos.find((e) => !e.corrida);
  const dias = proximo ? Math.ceil((new Date(proximo.fecha) - new Date()) / (1000 * 60 * 60 * 24)) : 0;

  const error = errorEventos || errorCampeonato || errorResultados;

  const ingresar = () =>
    supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
  const salir = () => {
    setTab("calendario");
    supabase.auth.signOut();
  };

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.text, fontFamily: "Inter, sans-serif" }}>
      <style>{FONTS}</style>
      <DevRibbon />

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${T.line}`, background: T.surface }}>
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
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
            {logueado && esAdminReal && (
              <NavTab icon={ShieldCheck} label="Admin" active={tab === "admin"} onClick={() => setTab("admin")} />
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={logueado ? salir : ingresar}
              title={logueado ? "Cerrar sesión" : "Ingresar con Google"}
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
              {logueado ? nombreParaMostrar(piloto, session) : "Ingresar con Google"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        {error && (
          <div
            style={{
              marginBottom: 24,
              padding: "12px 16px",
              borderRadius: 8,
              background: `${T.red}15`,
              border: `1px solid ${T.red}40`,
              fontSize: 13,
              color: T.red,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <AlertTriangle size={14} />
            No se pudo conectar con la base ({error.message ?? "error desconocido"}). Revisá
            VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
          </div>
        )}

        {!logueado && tab === "calendario" && <LoginCard />}
        {logueado && tab === "calendario" && <MiPerfil session={session} piloto={piloto} loading={cargandoPiloto} />}

        {tab === "calendario" && (
          <>
            {cargandoEventos && <div style={{ color: T.muted, fontSize: 13 }}>Cargando calendario...</div>}

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

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {eventos.map((e) => (
                <EventoCard
                  key={e.id}
                  evento={e}
                  onVerResultados={(id) => {
                    setEventoResultadosId(id);
                    setTab("resultados");
                  }}
                />
              ))}
            </div>
          </>
        )}

        {tab === "admin" && esAdminReal && <AdminPanel />}

        {(tab === "resultados" || tab === "campeonato") && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {clases.map((c) => (
                <button
                  key={c}
                  onClick={() => setClase(c)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: `1px solid ${claseActiva === c ? T.amber : T.line}`,
                    background: claseActiva === c ? `${T.amber}18` : "transparent",
                    color: claseActiva === c ? T.amber : T.muted,
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
                    value={eventoResultadosIdActivo ?? ""}
                    onChange={(e) => setEventoResultadosId(e.target.value)}
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
                {cargandoResultados && <div style={{ color: T.muted, fontSize: 13 }}>Cargando resultados...</div>}
                {!cargandoResultados && claseActiva && resultadosPorClase[claseActiva] ? (
                  <TablaResultados data={resultadosPorClase[claseActiva]} />
                ) : (
                  !cargandoResultados && (
                    <div style={{ color: T.muted, fontSize: 13, padding: "24px 0" }}>
                      No hay resultados de {claseActiva?.replace("Touring Eco 1:10 ", "") ?? "esta clase"} en esta fecha.
                    </div>
                  )
                )}
              </>
            ) : (
              <>
                {cargandoCampeonato && <div style={{ color: T.muted, fontSize: 13 }}>Cargando campeonato...</div>}
                {campeonato && (
                  <div style={{ color: T.muted, fontSize: 13, marginBottom: 12, fontFamily: "JetBrains Mono, monospace" }}>
                    {campeonato.nombre.toUpperCase()}
                    {campeonato.fecha_inicio && campeonato.fecha_fin
                      ? ` — ${new Date(campeonato.fecha_inicio).toLocaleDateString("es-AR")} al ${new Date(
                          campeonato.fecha_fin
                        ).toLocaleDateString("es-AR")}`
                      : ""}
                  </div>
                )}
                {claseActiva && campeonatoPorClase[claseActiva] && <TablaCampeonato data={campeonatoPorClase[claseActiva]} />}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
