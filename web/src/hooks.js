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
  const [version, setVersion] = useState(0);

  const recargar = () => setVersion((v) => v + 1);

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
  }, [version]);

  return { pilotos, loading, error, recargar };
}

// Trae todo el calendario, ordenado por fecha.
export function useEventos() {
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  const recargar = () => setVersion((v) => v + 1);

  useEffect(() => {
    let activo = true;
    setLoading(true);
    supabase
      .from("eventos")
      .select("*, circuitos ( id, numero, nombre )")
      .order("fecha", { ascending: false })
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) setError(error);
        else setEventos(data ?? []);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [version]);

  return { eventos, loading, error, recargar };
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
      .select("posicion, resultado, heat, tq, vuelta_rapida, clases ( nombre ), pilotos ( id, first_name, last_name )")
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
            pilotoId: fila.pilotos?.id,
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

// Ganador de cada final (A/B) por clase, para TODOS los eventos en una
// sola consulta -- se usa en las tarjetas del Calendario, no tiene
// sentido hacer una consulta por tarjeta. Mismo criterio de heat que
// TablaResultados.jsx (heat empieza con "A"/"B" -> final A/B) y mismo
// cuidado: el ganador es la MENOR posición DENTRO de su heat, no
// necesariamente `posicion = 1` -- Live Timing suele numerar la B
// Final continuando después de la A (ej. A: 1-10, B: 11-20), así que
// filtrar por posicion=1 se perdía siempre al ganador de la B.
// Devuelve { [eventoId]: { [claseNombre]: { A: nombre, B: nombre } } }.
export function useGanadoresPorEvento() {
  const [porEvento, setPorEvento] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let activo = true;
    supabase
      .from("resultados_finales")
      .select("evento_id, heat, posicion, clases ( nombre ), pilotos ( first_name, last_name )")
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) {
          setLoading(false);
          return;
        }
        const mejorPorGrupo = {};
        for (const fila of data ?? []) {
          const heat = (fila.heat ?? "").trim();
          const tipo = /^b/i.test(heat) ? "B" : /^a/i.test(heat) ? "A" : null;
          if (!tipo) continue;
          const clase = fila.clases?.nombre ?? "Sin clase";
          const clave = `${fila.evento_id}|${clase}|${tipo}`;
          const actual = mejorPorGrupo[clave];
          if (!actual || fila.posicion < actual.posicion) {
            mejorPorGrupo[clave] = {
              eventoId: fila.evento_id,
              clase,
              tipo,
              posicion: fila.posicion,
              nombre: nombrePiloto(fila.pilotos),
            };
          }
        }
        const agrupado = {};
        for (const { eventoId, clase, tipo, nombre } of Object.values(mejorPorGrupo)) {
          agrupado[eventoId] ??= {};
          agrupado[eventoId][clase] ??= {};
          agrupado[eventoId][clase][tipo] = nombre;
        }
        setPorEvento(agrupado);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  return { porEvento, loading };
}

// Clasificación de un evento (posición de largada, calculada por Live
// Timing a partir de las rondas clasificatorias -- distinta de
// resultados_finales, que es el resultado de la final en sí), agrupada
// por clase: { [claseNombre]: [{ pos, piloto, resultado, rondas, tieBreaker }] }
export function useClasificacionEvento(eventoId) {
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
      .from("clasificacion")
      .select("posicion, resultado, rondas, tie_breaker, clases ( nombre ), pilotos ( id, first_name, last_name )")
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
            pilotoId: fila.pilotos?.id,
            pos: fila.posicion,
            piloto: nombrePiloto(fila.pilotos),
            resultado: fila.resultado,
            rondas: fila.rondas ?? [],
            tieBreaker: fila.tie_breaker,
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
        .select("posicion, puntos, tqs, wins_1ro, eventos_registrados, clases ( nombre ), pilotos ( id, first_name, last_name )")
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
          pilotoId: fila.pilotos?.id,
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

// Catálogo completo de circuitos (para el selector de "Circuito" al editar
// un evento, y para el apartado público "Circuitos"). El dibujo no se
// guarda en la base: se arma en el frontend a partir de `numero`
// (`/circuitos-normales/Circuito{numero}.png` / `/circuitos-invertidos/...`,
// assets estáticos ya presentes en `web/public/`).
export function useCircuitos() {
  const [circuitos, setCircuitos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  const recargar = () => setVersion((v) => v + 1);

  useEffect(() => {
    let activo = true;
    supabase
      .from("circuitos")
      .select("id, numero, nombre")
      .order("numero")
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) setError(error);
        else setCircuitos(data ?? []);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [version]);

  return { circuitos, loading, error, recargar };
}

// Récords vigentes de un circuito, agrupados por categoría:
// { [claseNombre]: { pilotoNombre, tiempo, fecha, claseId } }. Es el récord
// actual (no un historial completo) -- el admin lo pisa a mano cuando se
// bate uno nuevo.
export function useCircuitoRecords(circuitoId, sentido) {
  const [porClase, setPorClase] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  const recargar = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!circuitoId) {
      setPorClase({});
      return;
    }
    let activo = true;
    setLoading(true);
    supabase
      .from("circuito_records")
      .select("id, clase_id, piloto_nombre, tiempo, fecha, clases ( nombre )")
      .eq("circuito_id", circuitoId)
      .eq("sentido", sentido)
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) {
          setError(error);
          setLoading(false);
          return;
        }
        const agrupado = {};
        for (const fila of data ?? []) {
          const clase = fila.clases?.nombre ?? "Sin categoría";
          agrupado[clase] = {
            id: fila.id,
            claseId: fila.clase_id,
            pilotoNombre: fila.piloto_nombre,
            tiempo: fila.tiempo,
            fecha: fila.fecha,
          };
        }
        setPorClase(agrupado);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [circuitoId, sentido, version]);

  return { porClase, loading, error, recargar };
}

// Catálogo completo de clases (para el selector de la inscripción online).
export function useClases() {
  const [clases, setClases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const recargar = () => setVersion((v) => v + 1);

  useEffect(() => {
    let activo = true;
    supabase
      .from("clases")
      .select("id, nombre, homologacion_eventos_minimos")
      .order("nombre")
      .then(({ data, error }) => {
        if (!activo) return;
        if (!error) setClases(data ?? []);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [version]);

  return { clases, loading, recargar };
}

// Categoría de la última inscripción del piloto (si tiene alguna), para
// preseleccionarla en el formulario de inscripción de la próxima fecha --
// la mayoría de los pilotos corren siempre en la misma.
export function useCategoriaPreferida(pilotoId) {
  const [claseId, setClaseId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pilotoId) {
      setClaseId(null);
      return;
    }
    let activo = true;
    setLoading(true);
    supabase
      .from("inscripciones")
      .select("clase_id")
      .eq("piloto_id", pilotoId)
      .order("fecha_inscripcion", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!activo) return;
        setClaseId(data?.clase_id ?? null);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [pilotoId]);

  return { claseId, loading };
}

// Inscripción del piloto logueado a un evento puntual (si existe). Se
// consulta por tarjeta de evento en el Calendario para decidir si mostrar
// el formulario de inscripción o "ya estás inscripto".
export function useInscripcionPiloto(eventoId, pilotoId) {
  const [inscripcion, setInscripcion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);

  const recargar = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!eventoId || !pilotoId) {
      setInscripcion(null);
      return;
    }
    let activo = true;
    setLoading(true);
    supabase
      .from("inscripciones")
      .select("id, clase_id, clases ( nombre )")
      .eq("evento_id", eventoId)
      .eq("piloto_id", pilotoId)
      .maybeSingle()
      .then(({ data }) => {
        if (!activo) return;
        setInscripcion(data ?? null);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [eventoId, pilotoId, version]);

  return { inscripcion, loading, recargar };
}

// ¿El usuario logueado es admin de verdad? Chequea que tenga el rol
// 'admin' en `piloto_roles` (server-side, ver
// touringrc-sync/sql/migrations/0003_roles_y_modulos.sql) -- no
// confundir con el toggle visual "ADMIN" del header, que ahora
// depende de esto para siquiera mostrarse.
export function useEsAdmin(session) {
  const [esAdmin, setEsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) {
      setEsAdmin(false);
      setLoading(false);
      return;
    }
    let activo = true;
    setLoading(true);
    supabase
      .from("pilotos")
      .select("piloto_roles ( rol_id )")
      .eq("auth_user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!activo) return;
        const roles = (data?.piloto_roles ?? []).map((r) => r.rol_id);
        setEsAdmin(roles.includes("admin"));
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [session?.user?.id]);

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

// Módulos a los que tiene acceso el usuario logueado (unión de todos
// sus roles) -- ver touringrc-sync/sql/migrations/0003_roles_y_modulos.sql.
// Devuelve un Set<string> para chequear fácil con .has("modulo_id").
export function useMisModulos(session) {
  const [modulos, setModulos] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) {
      setModulos(new Set());
      setLoading(false);
      return;
    }
    let activo = true;
    setLoading(true);
    supabase
      .rpc("mis_modulos")
      .then(({ data, error }) => {
        if (!activo) return;
        if (!error) setModulos(new Set((data ?? []).map((r) => r.modulo_id)));
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [session?.user?.id]);

  return { modulos, loading };
}

// Catálogo completo de roles, módulos y qué módulo tiene cada rol
// habilitado -- para el panel admin "Roles y módulos".
export function useRolesYModulos(habilitado) {
  const [roles, setRoles] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [rolModulos, setRolModulos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  const recargar = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!habilitado) return;
    let activo = true;
    setLoading(true);
    Promise.all([
      supabase.from("roles").select("*").order("id"),
      supabase.from("modulos").select("*").order("id"),
      supabase.from("rol_modulos").select("*"),
    ]).then(([r, m, rm]) => {
      if (!activo) return;
      const err = r.error || m.error || rm.error;
      if (err) {
        setError(err);
      } else {
        setRoles(r.data ?? []);
        setModulos(m.data ?? []);
        setRolModulos(rm.data ?? []);
      }
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [habilitado, version]);

  return { roles, modulos, rolModulos, loading, error, recargar };
}

// Qué rol(es) tiene asignado cada piloto -- { piloto_id: Set(rol_id) }.
export function usePilotoRoles(habilitado) {
  const [porPiloto, setPorPiloto] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  const recargar = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!habilitado) return;
    let activo = true;
    setLoading(true);
    supabase
      .from("piloto_roles")
      .select("piloto_id, rol_id")
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) {
          setError(error);
          setLoading(false);
          return;
        }
        const mapa = {};
        for (const row of data ?? []) {
          if (!mapa[row.piloto_id]) mapa[row.piloto_id] = new Set();
          mapa[row.piloto_id].add(row.rol_id);
        }
        setPorPiloto(mapa);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [habilitado, version]);

  return { porPiloto, loading, error, recargar };
}

// Oficina técnica: catálogo de marcas de neumáticos (para el selector
// visual por logo). RLS restringe select/insert/update/delete a
// admin/tecnica (migración 0017) -- para cualquier otro usuario esta
// consulta simplemente devuelve vacío.
export function useMarcasNeumaticos() {
  const [marcas, setMarcas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  const recargar = () => setVersion((v) => v + 1);

  useEffect(() => {
    let activo = true;
    supabase
      .from("marcas_neumaticos")
      .select("id, nombre, logo_url")
      .order("nombre")
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) setError(error);
        else setMarcas(data ?? []);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [version]);

  return { marcas, loading, error, recargar };
}

// Oficina técnica: estado de homologación de cada piloto para una
// categoría -- última marca homologada, eventos transcurridos desde
// entonces, y si está apto para homologar un juego nuevo (ver
// neumaticos_estado_clase() en la migración 0017 para la regla).
export function useNeumaticosEstadoClase(claseId) {
  const [estado, setEstado] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  const recargar = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!claseId) {
      setEstado([]);
      return;
    }
    let activo = true;
    setLoading(true);
    supabase
      .rpc("neumaticos_estado_clase", { p_clase_id: claseId })
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) setError(error);
        else setEstado(data ?? []);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [claseId, version]);

  return { estado, loading, error, recargar };
}

// Oficina técnica: historial completo de homologaciones de una
// categoría (no solo la última, a diferencia de neumaticos_estado_clase),
// agrupado por piloto -- para poder editar/corregir cualquiera, no solo
// la más reciente. Cruza con homologaciones_pendientes para que cada
// fila sepa si ya tiene una corrección propuesta esperando revisión de
// un admin (migración 0018).
export function useHistorialHomologaciones(claseId) {
  const [porPiloto, setPorPiloto] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  const recargar = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!claseId) {
      setPorPiloto({});
      return;
    }
    let activo = true;
    setLoading(true);

    Promise.all([
      supabase
        .from("homologaciones_neumaticos")
        .select("id, piloto_id, eventos ( nombre, fecha ), marcas_neumaticos ( id, nombre, logo_url )")
        .eq("clase_id", claseId),
      supabase.from("homologaciones_pendientes").select("id, homologacion_id, propuesto_por, marcas_neumaticos ( nombre, logo_url )").eq("resuelto", false),
    ]).then(([homologaciones, pendientes]) => {
      if (!activo) return;
      if (homologaciones.error) {
        setError(homologaciones.error);
        setLoading(false);
        return;
      }
      const pendientePorHomologacion = {};
      for (const p of pendientes.data ?? []) {
        pendientePorHomologacion[p.homologacion_id] = p;
      }
      const agrupado = {};
      for (const h of homologaciones.data ?? []) {
        (agrupado[h.piloto_id] ??= []).push({
          id: h.id,
          eventoNombre: h.eventos?.nombre,
          fecha: h.eventos?.fecha,
          marca: h.marcas_neumaticos,
          pendiente: pendientePorHomologacion[h.id] ?? null,
        });
      }
      for (const lista of Object.values(agrupado)) {
        lista.sort((a, b) => new Date(b.fecha ?? 0) - new Date(a.fecha ?? 0));
      }
      setPorPiloto(agrupado);
      setLoading(false);
    });

    return () => {
      activo = false;
    };
  }, [claseId, version]);

  return { porPiloto, loading, error, recargar };
}

// Oficina técnica, solo admin: cola de correcciones de marca que
// propuso técnica sobre homologaciones ya cargadas, esperando
// aprobación o rechazo (migración 0018) -- mismo patrón que
// useVinculosPendientes.
export function useHomologacionesPendientes(habilitado) {
  const [pendientes, setPendientes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  const recargar = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!habilitado) return;
    let activo = true;
    setLoading(true);
    supabase
      .from("homologaciones_pendientes")
      .select(
        "id, homologacion_id, marca_id_nueva, propuesto_por, creado_at, marcas_neumaticos ( nombre, logo_url ), homologaciones_neumaticos ( pilotos ( first_name, last_name ), clases ( nombre ), eventos ( nombre, fecha ), marcas_neumaticos ( nombre, logo_url ) )",
      )
      .eq("resuelto", false)
      .order("creado_at")
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) setError(error);
        else setPendientes(data ?? []);
        setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [habilitado, version]);

  return { pendientes, loading, error, recargar };
}
