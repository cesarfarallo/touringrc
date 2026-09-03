import { useEffect, useMemo, useState } from "react";
import { Calendar, Trophy, Flag, User, ShieldCheck, AlertTriangle, UserPlus, Map } from "lucide-react";
import { T, FONTS, RESPONSIVE_CSS } from "./theme";
import {
  useEventos,
  useResultadosEvento,
  useClasificacionEvento,
  useCampeonato,
  useSession,
  usePilotoActual,
  useEsAdmin,
  useInscripcionPiloto,
  useMisModulos,
} from "./hooks";
import { supabase } from "./lib/supabase";
import NavTab from "./components/NavTab";
import StartLights from "./components/StartLights";
import EventoCard, { FormularioInscripcion, inscripcionAbierta } from "./components/EventoCard";
import TablaResultados from "./components/TablaResultados";
import TablaClasificacion from "./components/TablaClasificacion";
import TablaCampeonato from "./components/TablaCampeonato";
import LoginCard from "./components/LoginCard";
import MiPerfil from "./components/MiPerfil";
import AdminPanel from "./components/AdminPanel";
import CircuitosView from "./components/CircuitosView";
import DevRibbon from "./components/DevRibbon";

function nombreParaMostrar(piloto, session) {
  const nombre = [piloto?.first_name, piloto?.last_name].filter(Boolean).join(" ");
  return nombre || session?.user?.email || "Piloto";
}

// Mismo criterio que DevRibbon.jsx: prende solo en local (npm run dev) o
// en Preview de Vercel (VITE_APP_ENV=staging) -- nunca en producción.
const ES_DEV = import.meta.env.DEV || import.meta.env.VITE_APP_ENV === "staging";

export default function TouringRCApp() {
  const [tab, setTab] = useState("calendario");
  const [inscripcionVersion, setInscripcionVersion] = useState(0);
  const [formularioDestacadoAbierto, setFormularioDestacadoAbierto] = useState(false);

  useEffect(() => {
    document.title = ES_DEV ? "Touring 1:10 Arg (DEV)" : "Touring 1:10 Arg";
  }, []);

  const { session } = useSession();
  const { piloto, loading: cargandoPiloto } = usePilotoActual(session);
  const logueado = !!session;
  const { esAdmin: esAdminReal } = useEsAdmin(session);
  // El rol 'piloto' (módulo 'inscripcion') es el "visto bueno" del
  // admin -- un piloto recién creado por un login sin match todavía no
  // lo tiene (migración 0013), así que no puede inscribirse hasta que
  // se confirme en "Vínculos pendientes".
  const { modulos: misModulos } = useMisModulos(session);
  const puedeInscribirse = misModulos.has("inscripcion");

  const { eventos, loading: cargandoEventos, error: errorEventos } = useEventos();
  const { campeonato, porClase: campeonatoPorClase, loading: cargandoCampeonato, error: errorCampeonato } = useCampeonato();

  const clases = Object.keys(campeonatoPorClase);
  const [clase, setClase] = useState(null);
  const claseActiva = clase && clases.includes(clase) ? clase : clases[0];
  const eventosOrdenados = useMemo(() => {
    return [...eventos].sort(
      (a, b) => new Date(`${b.fecha}T00:00:00`) - new Date(`${a.fecha}T00:00:00`)
    );
  }, [eventos]);

  // `corrida` es un flag manual que no siempre queda prendido (ver
  // marcarArchivo() en la Edge Function) -- una fecha pasada entra igual,
  // mismo criterio de respaldo que `resultadosDisponibles` en EventoCard.jsx,
  // para no depender 100% de ese flag.
  const eventosCorridos = useMemo(() => {
    const hoyResultados = new Date();
    hoyResultados.setHours(0, 0, 0, 0);
    return [...eventos]
      .filter((e) => e.corrida || new Date(`${e.fecha}T00:00:00`) < hoyResultados)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, [eventos]);
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

  const [subTabResultados, setSubTabResultados] = useState("finales");
  const {
    porClase: clasificacionPorClase,
    loading: cargandoClasificacion,
    error: errorClasificacion,
  } = useClasificacionEvento(eventoResultadosIdActivo);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const proximo = [...eventos]
    .filter((e) => new Date(`${e.fecha}T00:00:00`) >= hoy)
    .sort((a, b) => new Date(`${a.fecha}T00:00:00`) - new Date(`${b.fecha}T00:00:00`))[0];
  const horasRestantes = proximo
    ? Math.max(0, (new Date(`${proximo.fecha}T00:00:00`) - new Date()) / (1000 * 60 * 60))
    : 0;
  const dias = proximo ? Math.ceil(horasRestantes / 24) : 0;
  const { inscripcion: inscripcionDestacada, recargar: recargarInscripcionDestacada } =
    useInscripcionPiloto(proximo?.id, piloto?.id);
  const inscripcionDestacadaAbierta = proximo ? inscripcionAbierta(proximo) : false;

  const error = errorEventos || errorCampeonato || errorResultados || errorClasificacion;

  const ingresar = () =>
    supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
  const salir = () => {
    setTab("calendario");
    supabase.auth.signOut();
  };

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.text, fontFamily: "Inter, sans-serif" }}>
      <style>{FONTS + RESPONSIVE_CSS}</style>
      <DevRibbon />

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${T.line}`, background: T.surface, overflow: "visible" }}>
        <div
          className="header-inner"
          style={{
            maxWidth: 900,
            margin: "0 auto",
            padding: "10px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 172,
            boxSizing: "border-box",
            overflow: "visible",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }} title="Touring 1:10 Arg">
            <img
              src="/logo.png"
              alt="Touring 1:10 Arg"
              style={{ height: 152, maxWidth: "min(340px, 30vw)", width: "auto", display: "block" }}
            />
          </div>
          <div className="nav-tabs" style={{ display: "flex", gap: 4 }}>
            <NavTab icon={Calendar} label="Calendario" active={tab === "calendario"} onClick={() => setTab("calendario")} />
            <NavTab icon={Flag} label="Resultados" active={tab === "resultados"} onClick={() => setTab("resultados")} />
            <NavTab icon={Trophy} label="Campeonato" active={tab === "campeonato"} onClick={() => setTab("campeonato")} />
            <NavTab icon={Map} label="Circuitos" active={tab === "circuitos"} onClick={() => setTab("circuitos")} />
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

      <div className="page-content" style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
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
        {logueado && tab === "calendario" && (
          <MiPerfil
            session={session}
            piloto={piloto}
            loading={cargandoPiloto}
            esAdmin={esAdminReal}
            puedeInscribirse={puedeInscribirse}
          />
        )}

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
                  flexWrap: "wrap",
                  gap: 16,
                }}
              >
                <div>
                  <div style={{ color: T.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
                    Próxima fecha
                  </div>
                  <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 32, fontWeight: 700 }}>{proximo.nombre}</div>
                  <button
                  onClick={() => {
                    if (!logueado) {
                      ingresar();
                      return;
                    }
                    if (logueado && piloto && !puedeInscribirse) return;
                    setFormularioDestacadoAbierto((abierto) => !abierto);
                  }}
                  disabled={!!inscripcionDestacada || (logueado && !!piloto && !puedeInscribirse)}
                  title={logueado && piloto && !puedeInscribirse ? "Tu cuenta todavía no fue aprobada por un admin" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 14,
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: inscripcionDestacada || (logueado && piloto && !puedeInscribirse) ? T.surfaceRaised : T.amber,
                    color: inscripcionDestacada || (logueado && piloto && !puedeInscribirse) ? T.muted : "#1A1300",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: inscripcionDestacada || (logueado && piloto && !puedeInscribirse) ? "default" : "pointer",
                  }}
                  >
                  <UserPlus size={14} />
                  {inscripcionDestacada
                    ? "Ya estás inscripto"
                    : logueado && piloto && !puedeInscribirse
                      ? "Pendiente de aprobación"
                      : formularioDestacadoAbierto
                        ? "Cerrar inscripción"
                        : "Inscribirme"}
                  </button>
                  {formularioDestacadoAbierto && logueado && piloto && puedeInscribirse && !inscripcionDestacada && inscripcionDestacadaAbierta && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.line}` }}>
                      <FormularioInscripcion
                        evento={proximo}
                        piloto={piloto}
                        onInscripto={() => {
                          setFormularioDestacadoAbierto(false);
                          setInscripcionVersion((version) => version + 1);
                          recargarInscripcionDestacada();
                        }}
                      />
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0 }}>
                  <StartLights diasRestantes={dias} horasRestantes={horasRestantes} />
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {eventosOrdenados.map((e) => (
                <EventoCard
                  key={e.id}
                  refreshInscripcion={inscripcionVersion}
                  onInscripto={() => {
                    setInscripcionVersion((version) => version + 1);
                  }}
                  evento={e}
                  piloto={piloto}
                  logueado={logueado}
                  puedeInscribirse={puedeInscribirse}
                  onLogin={ingresar}
                  onVerResultados={(id) => {
                    setEventoResultadosId(id);
                    setTab("resultados");
                  }}
                />
              ))}
            </div>
          </>
        )}

        {tab === "circuitos" && <CircuitosView esAdmin={esAdminReal} />}

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
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[
                      { id: "finales", label: "Resultados finales" },
                      { id: "clasificacion", label: "Clasificación" },
                    ].map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSubTabResultados(s.id)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: `1px solid ${subTabResultados === s.id ? T.amber : T.line}`,
                          background: subTabResultados === s.id ? `${T.amber}18` : "transparent",
                          color: subTabResultados === s.id ? T.amber : T.muted,
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

                {subTabResultados === "finales" ? (
                  <>
                    {cargandoResultados && <div style={{ color: T.muted, fontSize: 13 }}>Cargando resultados...</div>}
                    {!cargandoResultados && claseActiva && resultadosPorClase[claseActiva] ? (
                      <TablaResultados data={resultadosPorClase[claseActiva]} pilotoId={piloto?.id} />
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
                    {cargandoClasificacion && <div style={{ color: T.muted, fontSize: 13 }}>Cargando clasificación...</div>}
                    {!cargandoClasificacion && claseActiva && clasificacionPorClase[claseActiva] ? (
                      <TablaClasificacion data={clasificacionPorClase[claseActiva]} pilotoId={piloto?.id} />
                    ) : (
                      !cargandoClasificacion && (
                        <div style={{ color: T.muted, fontSize: 13, padding: "24px 0" }}>
                          No hay clasificación de {claseActiva?.replace("Touring Eco 1:10 ", "") ?? "esta clase"} en esta
                          fecha.
                        </div>
                      )
                    )}
                  </>
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
                {claseActiva && campeonatoPorClase[claseActiva] &&                 <TablaCampeonato data={campeonatoPorClase[claseActiva]} pilotoId={piloto?.id} />}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
