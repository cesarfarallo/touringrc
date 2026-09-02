import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

function nombrePiloto(piloto) {
  if (!piloto) return "(piloto desconocido)";
  return [piloto.first_name, piloto.last_name].filter(Boolean).join(" ");
}

// Sesión de Supabase Auth (null si no hay nadie logueado). Se actualiza sola
// ante login/logout gracias a onAuthStateChange.
export function useSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

// Fila de `pilotos` vinculada a la sesión actual (la crea/vincula el
// trigger on_auth_user_created en el primer login, ver
// touringrc-sync/sql/migrations/0001_auth_vincula_piloto.sql).
// `loading` distingue "todavía consultando" de "consulté y no hay piloto
// vinculado" (esto último no debería pasar nunca si el trigger corrió bien).
export function usePilotoActual(session) {
  const [piloto, setPiloto] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) {
      setPiloto(null);
      setLoading(false);
      return;
    }
    let activo = true;
    setLoading(true);
    supabase
      .from("pilotos")
      .select("*")
      .eq("auth_user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!activo) return;
        setPiloto(data ?? null);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [session?.user?.id]);

  return { piloto, loading };
}

// Todos los pilotos, con el email y si tienen o no una cuenta vinculada
// (auth_user_id). Pensado para un panel admin simple que audite que el
// login se está asociando bien. `pilotos` tiene select público (RLS), así
// que no hace falta ningún permiso especial para leerlo.
export function usePilotos() {
  const [pilotos, setPilotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;
    setLoading(true);
    supabase
      .from("pilotos")
      .select("id, first_name, last_name, email, auth_user_id, created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) setError(error);
        else setPilotos(data ?? []);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  return { pilotos, loading, error };
}

// Trae todo el calendario, ordenado por fecha.
export function useEventos() {
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;
    setLoading(true);
    supabase
      .from("eventos")
      .select("*")
      .order("fecha", { ascending: true })
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) setError(error);
        else setEventos(data ?? []);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  return { eventos, loading, error };
}

// Resultados finales de un evento, agrupados por clase:
// { [claseNombre]: [{ pos, piloto, resultado, heat, tq, vueltaRapida }] }
export function useResultadosEvento(eventoId) {
  const [porClase, setPorClase] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!eventoId) {
      setPorClase({});
      return;
    }
    let activo = true;
    setLoading(true);
    supabase
      .from("resultados_finales")
      .select("posicion, resultado, heat, tq, vuelta_rapida, clases ( nombre ), pilotos ( first_name, last_name )")
      .eq("evento_id", eventoId)
      .order("posicion", { ascending: true })
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) {
          setError(error);
          setLoading(false);
          return;
        }
        const agrupado = {};
        for (const fila of data ?? []) {
          const clase = fila.clases?.nombre ?? "Sin clase";
          if (!agrupado[clase]) agrupado[clase] = [];
          agrupado[clase].push({
            pos: fila.posicion,
            piloto: nombrePiloto(fila.pilotos),
            resultado: fila.resultado,
            heat: fila.heat,
            tq: fila.tq,
            vueltaRapida: fila.vuelta_rapida,
          });
        }
        setPorClase(agrupado);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [eventoId]);

  return { porClase, loading, error };
}

// Campeonato vigente (el de fecha_inicio más reciente) + standings por clase.
export function useCampeonato() {
  const [campeonato, setCampeonato] = useState(null);
  const [porClase, setPorClase] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;
    setLoading(true);

    async function cargar() {
      const { data: campeonatos, error: errCampeonato } = await supabase
        .from("campeonatos")
        .select("*")
        .order("fecha_inicio", { ascending: false })
        .limit(1);

      if (!activo) return;
      if (errCampeonato || !campeonatos?.length) {
        setError(errCampeonato ?? null);
        setLoading(false);
        return;
      }
      const actual = campeonatos[0];
      setCampeonato(actual);

      const { data: puntos, error: errPuntos } = await supabase
        .from("campeonato_puntos")
        .select("posicion, puntos, tqs, wins_1ro, eventos_registrados, clases ( nombre ), pilotos ( first_name, last_name )")
        .eq("campeonato_id", actual.id)
        .order("posicion", { ascending: true });

      if (!activo) return;
      if (errPuntos) {
        setError(errPuntos);
        setLoading(false);
        return;
      }
      const agrupado = {};
      for (const fila of puntos ?? []) {
        const clase = fila.clases?.nombre ?? "Sin clase";
        if (!agrupado[clase]) agrupado[clase] = [];
        agrupado[clase].push({
          pos: fila.posicion,
          piloto: nombrePiloto(fila.pilotos),
          puntos: fila.puntos,
          tqs: fila.tqs,
          wins: fila.wins_1ro,
          eventos: fila.eventos_registrados,
        });
      }
      setPorClase(agrupado);
      setLoading(false);
    }

    cargar();
    return () => {
      activo = false;
    };
  }, []);

  return { campeonato, porClase, loading, error };
}

// ¿El usuario logueado es admin de verdad? Chequea la tabla `admins`
// (server-side, ver touringrc-sync/sql/migrations/0002_admin_y_vinculo_por_nombre.sql)
// -- no confundir con el toggle visual "ADMIN" del header, que ahora
// depende de esto para siquiera mostrarse.
export function useEsAdmin(session) {
  const [esAdmin, setEsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.email) {
      setEsAdmin(false);
      setLoading(false);
      return;
    }
    let activo = true;
    setLoading(true);
    supabase
      .from("admins")
      .select("email")
      .eq("email", session.user.email)
      .maybeSingle()
      .then(({ data }) => {
        if (!activo) return;
        setEsAdmin(!!data);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [session?.user?.email]);

  return { esAdmin, loading };
}

// Logins que no matchearon 1 a 1 contra el roster ya cargado (el admin
// tiene que confirmar el piloto nuevo o fusionarlo con uno existente).
// Trae también los pilotos candidatos/creado para mostrar sus nombres,
// en una segunda consulta (evita depender de nombres de foreign keys
// autogenerados por Postgres para el nested select).
export function useVinculosPendientes(habilitado) {
  const [vinculos, setVinculos] = useState([]);
  const [pilotosPorId, setPilotosPorId] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  const recargar = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!habilitado) return;
    let activo = true;
    setLoading(true);

    async function cargar() {
      const { data: pendientes, error: errVinculos } = await supabase
        .from("vinculos_pendientes")
        .select("*")
        .eq("resuelto", false)
        .order("creado_at", { ascending: false });

      if (!activo) return;
      if (errVinculos) {
        setError(errVinculos);
        setLoading(false);
        return;
      }

      const ids = new Set();
      for (const v of pendientes ?? []) {
        if (v.piloto_creado_id) ids.add(v.piloto_creado_id);
        for (const c of v.candidatos ?? []) ids.add(c);
      }

      let mapa = {};
      if (ids.size > 0) {
        const { data: pilotos, error: errPilotos } = await supabase
          .from("pilotos")
          .select("id, first_name, last_name, permanent_number")
          .in("id", Array.from(ids));
        if (!activo) return;
        if (errPilotos) {
          setError(errPilotos);
          setLoading(false);
          return;
        }
        mapa = Object.fromEntries((pilotos ?? []).map((p) => [p.id, p]));
      }

      setVinculos(pendientes ?? []);
      setPilotosPorId(mapa);
      setLoading(false);
    }

    cargar();
    return () => {
      activo = false;
    };
  }, [habilitado, version]);

  return { vinculos, pilotosPorId, loading, error, recargar };
}

