import { useEffect, useMemo, useState } from "react";
import { Calendar, Trophy, Flag, User, ShieldCheck, AlertTriangle, UserPlus, Map, Share2, Eye, Wrench, History, Menu, X, ChevronDown } from "lucide-react";
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
  useGanadoresPorEvento,
  useFrasesDestacadas,
} from "./hooks";
import { supabase } from "./lib/supabase";
import NavTab from "./components/NavTab";
import StartLights from "./components/StartLights";
import EventoCard, { FormularioInscripcion, inscripcionAbierta } from "./components/EventoCard";
import { rutaImagenCircuito } from "./lib/circuitos";
import TablaResultados from "./components/TablaResultados";
import TablaClasificacion from "./components/TablaClasificacion";
import TablaCampeonato from "./components/TablaCampeonato";
import LoginCard from "./components/LoginCard";
import MiPerfil from "./components/MiPerfil";
import AdminPanel from "./components/AdminPanel";
import CircuitosView from "./components/CircuitosView";
import OficinaTecnica from "./components/OficinaTecnica";
import ResultadosHistoricos from "./components/ResultadosHistoricos";
import ModalInscriptos from "./components/ModalInscriptos";
import DevRibbon from "./components/DevRibbon";

// Inscriptos de un evento agrupados por categoría: { [clase]: [nombre, ...] }.
// Compartido entre "Compartir inscriptos" (admin, copia texto) y
// "Ver inscriptos" (público, popup) -- requiere la policy de select de
// las migraciones 0015 (admin)/0016 (pública).
async function obtenerInscriptosPorClase(eventoId) {
  const { data, error } = await supabase
    .from("inscripciones")
    .select("pilotos ( first_name, last_name ), clases ( nombre )")
    .eq("evento_id", eventoId);
  if (error) throw error;
  const porClase = {};
  for (const i of data ?? []) {
    const clase = i.clases?.nombre ?? "Sin categoría";
    const nombre = [i.pilotos?.first_name, i.pilotos?.last_name].filter(Boolean).join(" ");
    (porClase[clase] ??= []).push(nombre);
  }
  return porClase;
}

function nombreParaMostrar(piloto, session) {
  const nombre = [piloto?.first_name, piloto?.last_name].filter(Boolean).join(" ");
  return nombre || session?.user?.email || "Piloto";
}

// Mismo criterio que DevRibbon.jsx: prende solo en local (npm run dev) o
// en Preview de Vercel (VITE_APP_ENV=staging) -- nunca en producción.
const ES_DEV = import.meta.env.DEV || import.meta.env.VITE_APP_ENV === "staging";

export default function TouringRCApp() {
  const [tab, setTab] = useState("calendario");
  const [menuMobileAbierto, setMenuMobileAbierto] = useState(false);
  const [inscripcionVersion, setInscripcionVersion] = useState(0);
  const [formularioDestacadoAbierto, setFormularioDestacadoAbierto] = useState(false);
  const [compartiendoInscriptos, setCompartiendoInscriptos] = useState(false);
  const [copiadoInscriptos, setCopiadoInscriptos] = useState(false);
  const [errorCompartir, setErrorCompartir] = useState(null);
  const [modalInscriptosAbierto, setModalInscriptosAbierto] = useState(false);
  const [cargandoModalInscriptos, setCargandoModalInscriptos] = useState(false);
  const [modalInscriptosPorClase, setModalInscriptosPorClase] = useState({});
  const [errorModalInscriptos, setErrorModalInscriptos] = useState(null);

  useEffect(() => {
    document.title = ES_DEV ? "Touring 1:10 Arg (DEV)" : "Touring 1:10 Arg";
  }, []);

  const { session } = useSession();
  const { piloto, loading: cargandoPiloto, recargar: recargarPiloto } = usePilotoActual(session);
  const logueado = !!session;
  const { esAdmin: esAdminReal } = useEsAdmin(session);
  // El rol 'piloto' (módulo 'inscripcion') es el "visto bueno" del
  // admin -- un piloto recién creado por un login sin match todavía no
  // lo tiene (migración 0013), así que no puede inscribirse hasta que
  // se confirme en "Vínculos pendientes".
  const { modulos: misModulos } = useMisModulos(session);
  const puedeInscribirse = misModulos.has("inscripcion");
  const puedeVerOficinaTecnica = misModulos.has("homologacion");

  // Un solo array para el nav de tabs (desktop, horizontal) y el menú
  // desplegable (mobile, hamburguesa) -- misma lista, dos formas de
  // mostrarla, en vez de duplicar las condiciones de "quién ve qué tab".
  const navItems = [
    { id: "calendario", icon: Calendar, label: "Calendario" },
    { id: "resultados", icon: Flag, label: "Resultados" },
    { id: "campeonato", icon: Trophy, label: "Campeonato" },
    { id: "circuitos", icon: Map, label: "Circuitos" },
    { id: "historicos", icon: History, label: "Resultados históricos" },
    logueado && puedeVerOficinaTecnica && { id: "tecnica", icon: Wrench, label: "Oficina técnica" },
    logueado && esAdminReal && { id: "admin", icon: ShieldCheck, label: "Admin" },
  ].filter(Boolean);
  const tabActivo = navItems.find((item) => item.id === tab) ?? navItems[0];

  const { eventos, loading: cargandoEventos, error: errorEventos } = useEventos();
  const { porEvento: ganadoresPorEvento } = useGanadoresPorEvento();
  const { campeonato, porClase: campeonatoPorClase, loading: cargandoCampeonato, error: errorCampeonato } = useCampeonato();
  const { frases: frasesDestacadas, loading: cargandoFrasesDestacadas } = useFrasesDestacadas(
    cargandoCampeonato ? "" : campeonato?.id ?? null
  );

  const clases = Object.keys(campeonatoPorClase);
  const [clase, setClase] = useState(null);
  const claseActiva = clase && clases.includes(clase) ? clase : clases[0];

  // Calendario y Resultados muestran por defecto solo la temporada vigente
  // (`campeonato`, el de fecha_inicio más reciente, ya calculado arriba por
  // useCampeonato()) -- años anteriores se ven aparte, en "Resultados
  // históricos". Mientras el campeonato vigente todavía está cargando, no
  // se filtra nada para no mostrar una lista vacía de arranque.
  const eventosTemporadaVigente = useMemo(() => {
    if (cargandoCampeonato) return eventos;
    if (!campeonato) return eventos;
    return eventos.filter((e) => e.campeonato_id === campeonato.id);
  }, [eventos, campeonato, cargandoCampeonato]);

  const eventosOrdenados = useMemo(() => {
    return [...eventosTemporadaVigente].sort(
      (a, b) => new Date(`${b.fecha}T00:00:00`) - new Date(`${a.fecha}T00:00:00`)
    );
  }, [eventosTemporadaVigente]);

  // `corrida` es un flag manual que no siempre queda prendido (ver
  // marcarArchivo() en la Edge Function) -- una fecha pasada entra igual,
  // mismo criterio de respaldo que `resultadosDisponibles` en EventoCard.jsx,
  // para no depender 100% de ese flag.
  const eventosCorridos = useMemo(() => {
    const hoyResultados = new Date();
    hoyResultados.setHours(0, 0, 0, 0);
    return [...eventosTemporadaVigente]
      .filter((e) => e.corrida || new Date(`${e.fecha}T00:00:00`) < hoyResultados)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, [eventosTemporadaVigente]);
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
  const proximo = [...eventosTemporadaVigente]
    .filter((e) => new Date(`${e.fecha}T00:00:00`) >= hoy)
    .sort((a, b) => new Date(`${a.fecha}T00:00:00`) - new Date(`${b.fecha}T00:00:00`))[0];
  const horasRestantes = proximo
    ? Math.max(0, (new Date(`${proximo.fecha}T00:00:00`) - new Date()) / (1000 * 60 * 60))
    : 0;
  const dias = proximo ? Math.ceil(horasRestantes / 24) : 0;
  const { inscripcion: inscripcionDestacada, recargar: recargarInscripcionDestacada } =
    useInscripcionPiloto(proximo?.id, piloto?.id);
  const inscripcionDestacadaAbierta = proximo ? inscripcionAbierta(proximo) : false;
  // Mismo criterio que el botón "Inscribirme" de cada EventoCard
  // (disabled={!abierta || !puedeInscribirse}) -- el de la tarjeta
  // destacada no lo chequeaba y quedaba clickeable aunque la ventana de
  // inscripción todavía no hubiera abierto.
  const puedeAbrirInscripcionDestacada =
    !inscripcionDestacada && inscripcionDestacadaAbierta && !(logueado && piloto && !puedeInscribirse);

  const error = errorEventos || errorCampeonato || errorResultados || errorClasificacion;

  const ingresar = () =>
    supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
  const salir = () => {
    setTab("calendario");
    supabase.auth.signOut();
  };

  // Arma un texto listo para pegar en redes con los inscriptos de la
  // próxima fecha, agrupados por categoría, y lo copia al portapapeles.
  // Requiere la policy de admin de la migración 0015 (antes de eso, un
  // admin solo podía leer su propia inscripción vía RLS).
  async function compartirInscriptos() {
    if (!proximo) return;
    setCompartiendoInscriptos(true);
    setErrorCompartir(null);
    try {
      const porClase = await obtenerInscriptosPorClase(proximo.id);
      if (Object.keys(porClase).length === 0) throw new Error("Todavía no hay inscriptos en esta fecha");

      const fechaStr = new Date(`${proximo.fecha}T00:00:00`).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      let texto = `🏁 INSCRIPTOS — ${proximo.nombre}\n📅 ${fechaStr}\n`;
      for (const [clase, nombres] of Object.entries(porClase)) {
        texto += `\n${clase} (${nombres.length})\n`;
        nombres.forEach((n, i) => {
          texto += `${i + 1}. ${n}\n`;
        });
      }
      await navigator.clipboard.writeText(texto.trim());
      setCopiadoInscriptos(true);
      setTimeout(() => setCopiadoInscriptos(false), 2500);
    } catch (err) {
      setErrorCompartir(err.message ?? String(err));
    } finally {
      setCompartiendoInscriptos(false);
    }
  }

  // Popup público (sin necesitar login ni ser admin) con el listado de
  // inscriptos de la próxima fecha -- requiere la policy de lectura
  // pública de la migración 0016.
  async function verInscriptos() {
    if (!proximo) return;
    setModalInscriptosAbierto(true);
    setCargandoModalInscriptos(true);
    setErrorModalInscriptos(null);
    try {
      const porClase = await obtenerInscriptosPorClase(proximo.id);
      setModalInscriptosPorClase(porClase);
    } catch (err) {
      setErrorModalInscriptos(err.message ?? String(err));
    } finally {
      setCargandoModalInscriptos(false);
    }
  }

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
              className="header-logo"
              src="/logo.png"
              alt="Touring 1:10 Arg"
              style={{ height: 152, maxWidth: "min(340px, 30vw)", width: "auto", display: "block" }}
            />
          </div>
          <div className="nav-tabs" style={{ display: "flex", gap: 4 }}>
            {navItems.map((item) => (
              <NavTab key={item.id} icon={item.icon} label={item.label} active={tab === item.id} onClick={() => setTab(item.id)} />
            ))}
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
            <button
              className="mobile-nav-toggle"
              onClick={() => setMenuMobileAbierto((v) => !v)}
              title={menuMobileAbierto ? "Cerrar menú" : "Abrir menú"}
              style={{
                display: "none",
                width: 38,
                height: 38,
                borderRadius: 8,
                border: `1px solid ${T.line}`,
                background: menuMobileAbierto ? T.amber : T.surfaceRaised,
                color: menuMobileAbierto ? "#1A1300" : T.text,
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {menuMobileAbierto ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Franja de "sección actual", solo mobile -- da contexto sin abrir el
            menú, y tocarla también lo abre/cierra. */}
        <div
          className="mobile-nav-current"
          onClick={() => setMenuMobileAbierto((v) => !v)}
          style={{
            display: "none",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "11px 14px",
            borderTop: `1px solid ${T.line}`,
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.amber, fontWeight: 600, fontSize: 14 }}>
            {tabActivo && <tabActivo.icon size={16} />}
            {tabActivo?.label}
          </div>
          <ChevronDown
            size={16}
            color={T.muted}
            style={{ transform: menuMobileAbierto ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
          />
        </div>

        {/* Menú desplegable (mobile) -- lista vertical de tabs, sin scroll
            horizontal. Solo puede abrirse tocando la hamburguesa o la franja
            de arriba, ambas ocultas en desktop, así que en desktop nunca se
            renderiza. */}
        {menuMobileAbierto && (
          <div style={{ borderTop: `1px solid ${T.line}`, background: T.surface, boxShadow: "0 12px 24px rgba(0,0,0,0.35)" }}>
            {navItems.map((item) => {
              const activo = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setTab(item.id);
                    setMenuMobileAbierto(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    height: 48,
                    padding: "0 16px",
                    boxSizing: "border-box",
                    border: "none",
                    borderLeft: `3px solid ${activo ? T.amber : "transparent"}`,
                    background: activo ? `${T.amber}18` : "transparent",
                    color: activo ? T.amber : T.muted,
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 600,
                    fontSize: 14,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <item.icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
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
            onCambioPiloto={recargarPiloto}
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
                  padding: 16,
                  marginBottom: 28,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  {proximo.circuitos && (
                    <img
                      src={rutaImagenCircuito(proximo.circuitos, proximo.circuito_sentido)}
                      alt={proximo.circuitos.nombre}
                      title={proximo.circuitos.nombre}
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: "contain",
                        borderRadius: 8,
                        background: "#FFFFFF",
                        border: `1px solid ${T.line}`,
                        padding: 4,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: T.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5 }}>
                      Próxima fecha
                    </div>
                    <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 22, fontWeight: 700, marginTop: 2 }}>
                      {proximo.nombre}
                    </div>
                    <div style={{ color: T.muted, fontSize: 13, marginTop: 4 }}>
                      {(() => {
                        const fechaCompleta = new Date(`${proximo.fecha}T00:00:00`).toLocaleDateString("es-AR", {
                          weekday: "long",
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        });
                        return fechaCompleta.charAt(0).toUpperCase() + fechaCompleta.slice(1);
                      })()}
                    </div>
                    {proximo.circuitos && (
                      <div style={{ color: T.muted, fontSize: 12, marginTop: 2 }}>
                        {proximo.circuitos.nombre} ({proximo.circuito_sentido === "invertido" ? "Invertido" : "Normal"})
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ background: T.surfaceRaised, borderRadius: 10, padding: "10px 14px" }}>
                  <StartLights
                    compact
                    diasRestantes={dias}
                    horasRestantes={horasRestantes}
                    inscripcionDiasAntes={proximo?.inscripcion_dias_antes ?? null}
                    frasesDestacadas={frasesDestacadas}
                    cargandoFrases={cargandoCampeonato || cargandoFrasesDestacadas}
                  />
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button
                    onClick={() => {
                      if (!puedeAbrirInscripcionDestacada) return;
                      if (!logueado) {
                        ingresar();
                        return;
                      }
                      setFormularioDestacadoAbierto((abierto) => !abierto);
                    }}
                    disabled={!puedeAbrirInscripcionDestacada}
                    title={
                      logueado && piloto && !puedeInscribirse
                        ? "Tu cuenta todavía no fue aprobada por un admin"
                        : !inscripcionDestacada && !inscripcionDestacadaAbierta
                          ? "La inscripción todavía no está abierta para esta fecha"
                          : undefined
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: puedeAbrirInscripcionDestacada ? T.amber : T.surfaceRaised,
                      color: puedeAbrirInscripcionDestacada ? "#1A1300" : T.muted,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: puedeAbrirInscripcionDestacada ? "pointer" : "default",
                    }}
                  >
                    <UserPlus size={14} />
                    {inscripcionDestacada
                      ? "Ya estás inscripto"
                      : logueado && piloto && !puedeInscribirse
                        ? "Pendiente de aprobación"
                        : !inscripcionDestacadaAbierta
                          ? "Inscripción no habilitada"
                          : formularioDestacadoAbierto
                            ? "Cerrar inscripción"
                            : "Inscribirme"}
                  </button>
                  <button
                    onClick={verInscriptos}
                    title="Ver quién está anotado en esta fecha"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: `1px solid ${T.line}`,
                      background: "transparent",
                      color: T.text,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <Eye size={13} /> Ver inscriptos
                  </button>
                  {esAdminReal && (
                    <button
                      onClick={compartirInscriptos}
                      disabled={compartiendoInscriptos}
                      title="Copia al portapapeles la lista de inscriptos de esta fecha, lista para pegar en redes"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: `1px solid ${T.line}`,
                        background: "transparent",
                        color: T.text,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: compartiendoInscriptos ? "default" : "pointer",
                      }}
                    >
                      <Share2 size={13} />
                      {compartiendoInscriptos ? "Generando..." : copiadoInscriptos ? "¡Copiado!" : "Compartir inscriptos"}
                    </button>
                  )}
                </div>
                {esAdminReal && errorCompartir && <div style={{ color: T.red, fontSize: 11 }}>{errorCompartir}</div>}

                {formularioDestacadoAbierto && logueado && piloto && puedeInscribirse && !inscripcionDestacada && inscripcionDestacadaAbierta && (
                  <div style={{ paddingTop: 4, borderTop: `1px solid ${T.line}` }}>
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
                  ganadores={ganadoresPorEvento[e.id]}
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

        {tab === "historicos" && <ResultadosHistoricos pilotoId={piloto?.id} />}

        {tab === "tecnica" && puedeVerOficinaTecnica && <OficinaTecnica esAdmin={esAdminReal} />}

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
                  {c.replace("Touring Eco ", "")}
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
                          No hay resultados de {claseActiva?.replace("Touring Eco ", "") ?? "esta clase"} en esta fecha.
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
                          No hay clasificación de {claseActiva?.replace("Touring Eco ", "") ?? "esta clase"} en esta
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

      {modalInscriptosAbierto && (
        <ModalInscriptos
          evento={proximo}
          cargando={cargandoModalInscriptos}
          porClase={modalInscriptosPorClase}
          error={errorModalInscriptos}
          onClose={() => setModalInscriptosAbierto(false)}
        />
      )}
    </div>
  );
}
