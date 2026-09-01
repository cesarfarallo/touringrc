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
export function usePilotoActual(session) {
  const [piloto, setPiloto] = useState(null);

  useEffect(() => {
    if (!session?.user?.id) {
      setPiloto(null);
      return;
    }
    let activo = true;
    supabase
      .from("pilotos")
      .select("*")
      .eq("auth_user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (activo) setPiloto(data ?? null);
      });
    return () => {
      activo = false;
    };
  }, [session?.user?.id]);

  return piloto;
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
