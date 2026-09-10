// Edge Function: arma un set de frases "destacadas" con datos reales de
// resultados/campeonato (migración 0027) -- ej. "El campeonato de Modified
// está al rojo vivo, ¿podrá X mantener la punta o Y lo alcanzará?". El
// Calendario (StartLights.jsx) elige una al azar de este set, mezclada con
// las frases genéricas de siempre, una sola vez por carga de página.
//
// Pensada para correr cada ~3 días vía pg_cron (ver README.md de esta
// carpeta) -- mismo patrón que avisar-inscripcion (migración 0026): sin
// sesión de usuario de por medio, protegida con un secreto compartido
// (CRON_SECRET) en el header x-cron-secret. A diferencia de esa función,
// el chequeo de "cada 3 días" no vive en el cron en sí (un cron diario es
// más robusto que uno cada N días, que con cron de calendario reinicia el
// conteo en cada mes) sino ACÁ ADENTRO: cada corrida mira cuándo se generó
// el último set para el campeonato vigente y no hace nada si todavía no
// pasaron 3 días -- así el cron de afuera puede programarse simplemente
// "una vez por día". Se puede forzar una regeneración inmediata mandando
// `{"forzar": true}` en el body (útil para probar sin esperar).
//
// Deploy: supabase functions deploy generar-frases-destacadas --no-verify-jwt
//
// Secrets que hay que configurar a mano (Dashboard → Edge Functions →
// generar-frases-destacadas → Secrets, o `supabase secrets set`):
//   CRON_SECRET -- mismo secreto compartido que usa avisar-inscripcion (se
//                  puede reusar el mismo valor o generar uno nuevo, da igual).
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const DIAS_ENTRE_GENERACIONES = 3;
// Mínimos para que cada historia cuente como "real" y no como ruido
// estadístico de una muestra chica -- ver el detector de cada una para el
// razonamiento puntual.
const MINIMO_EVENTOS_NUNCA_GANO = 3;
const MINIMO_ABANDONOS = 2;
const MINIMO_VUELTAS_RAPIDAS = 2;
const MINIMO_TQS = 2;
const UMBRAL_SEGUNDOS_AUTOS_APRETADOS = 1;
const MINIMO_AUTOS_APRETADOS = 3;

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!CRON_SECRET) return json({ error: "Falta configurar el secret CRON_SECRET" }, 500);
    if (req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "Secreto inválido" }, 401);

    let forzar = false;
    try {
      const body = await req.json();
      forzar = body?.forzar === true;
    } catch {
      // sin body (ej. el cron manda "{}" o nada) -- forzar queda en false
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const resultado = await generarFrases(sb, forzar);
    return json({ ok: true, ...resultado }, 200);
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});

function nombrePiloto(piloto: { first_name?: string; last_name?: string } | null | undefined) {
  if (!piloto) return "un piloto";
  return [piloto?.first_name, piloto?.last_name].filter(Boolean).join(" ") || "un piloto";
}

// Mismo criterio que el frontend (App.jsx / ResultadosHistoricos.jsx) para
// acortar el nombre de la categoría en textos: "Touring Eco Modified" ->
// "Modified".
function claseCorta(nombre: string) {
  return nombre.replace("Touring Eco ", "");
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

// deno-lint-ignore no-explicit-any
async function generarFrases(sb: any, forzar: boolean) {
  const { data: campeonatos, error: errCampeonatos } = await sb
    .from("campeonatos")
    .select("id, nombre, fecha_inicio")
    .order("fecha_inicio", { ascending: false });
  if (errCampeonatos) throw new Error(`campeonatos.select: ${errCampeonatos.message}`);
  if (!campeonatos || campeonatos.length === 0) {
    return { generadas: 0, motivo: "no hay ningún campeonato cargado todavía" };
  }
  const vigente = campeonatos[0];
  const anterior = campeonatos[1] ?? null;

  if (!forzar) {
    const { data: ultimaFila, error: errUltima } = await sb
      .from("frases_destacadas")
      .select("generado_en")
      .eq("campeonato_id", vigente.id)
      .order("generado_en", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (errUltima) throw new Error(`frases_destacadas.select: ${errUltima.message}`);
    if (ultimaFila) {
      const horasPasadas = (Date.now() - new Date(ultimaFila.generado_en).getTime()) / (1000 * 60 * 60);
      if (horasPasadas < DIAS_ENTRE_GENERACIONES * 24) {
        return {
          generadas: 0,
          motivo: `todavía no pasaron ${DIAS_ENTRE_GENERACIONES} días desde la última generación`,
          ultima_generacion: ultimaFila.generado_en,
        };
      }
    }
  }

  const { data: clases, error: errClases } = await sb.from("clases").select("id, nombre");
  if (errClases) throw new Error(`clases.select: ${errClases.message}`);

  // Hoisteados acá afuera: no dependen de la clase, así que se piden una
  // sola vez y se reusan en el loop de abajo en vez de repetir la consulta
  // por cada categoría.
  const { data: eventosVigente, error: errEventosVigente } = await sb
    .from("eventos")
    .select("id")
    .eq("campeonato_id", vigente.id);
  if (errEventosVigente) throw new Error(`eventos.select (ids vigente): ${errEventosVigente.message}`);
  const eventoIdsVigente = (eventosVigente ?? []).map((e: { id: string }) => e.id);

  const { data: eventosCorridos, error: errEventosCorridos } = await sb
    .from("eventos")
    .select("id, fecha")
    .eq("campeonato_id", vigente.id)
    .eq("corrida", true)
    .order("fecha", { ascending: false })
    .limit(4);
  if (errEventosCorridos) throw new Error(`eventos.select (corridos): ${errEventosCorridos.message}`);

  const { data: proximaFecha, error: errProxima } = await sb
    .from("eventos")
    .select("circuito_id, circuito_sentido, circuitos ( nombre )")
    .eq("campeonato_id", vigente.id)
    .not("circuito_id", "is", null)
    .gte("fecha", hoyISO())
    .order("fecha", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (errProxima) throw new Error(`eventos.select (próxima fecha): ${errProxima.message}`);

  const candidatos: { texto: string; categoria: string; clase_id: string }[] = [];
  for (const clase of clases ?? []) {
    candidatos.push(...(await detectarSituacionCampeonato(sb, vigente, clase)));
    candidatos.push(...(await detectarExCampeonSinGanar(sb, vigente, anterior, clase)));
    candidatos.push(...(await detectarNuncaGanoUnaFecha(sb, vigente, clase)));
    candidatos.push(...(await detectarRachaVictorias(sb, eventosCorridos, clase)));
    candidatos.push(...(await detectarRachaPodio(sb, eventosCorridos, clase)));
    candidatos.push(...(await detectarSinPodio(sb, eventoIdsVigente, eventosCorridos, clase)));
    candidatos.push(...(await detectarVictoriaAlternada(sb, eventosCorridos, clase)));
    candidatos.push(...(await detectarAbandonos(sb, eventoIdsVigente, clase)));
    candidatos.push(...(await detectarVueltasRapidasDominante(sb, eventoIdsVigente, vigente, clase)));
    candidatos.push(...(await detectarTQsDominante(sb, vigente, clase)));
    candidatos.push(...(await detectarRecordEnJuego(sb, proximaFecha, clase)));
    candidatos.push(...(await detectarAutosEnUnSegundo(sb, eventosCorridos, clase)));
  }

  // Se borra el set anterior de este campeonato recién acá (no antes de
  // buscar los candidatos) para no dejar la tabla vacía si algo de arriba
  // tira una excepción a mitad de camino.
  const { error: errDelete } = await sb.from("frases_destacadas").delete().eq("campeonato_id", vigente.id);
  if (errDelete) throw new Error(`frases_destacadas.delete: ${errDelete.message}`);

  if (candidatos.length > 0) {
    const filas = candidatos.map((c) => ({ ...c, campeonato_id: vigente.id }));
    const { error: errInsert } = await sb.from("frases_destacadas").insert(filas);
    if (errInsert) throw new Error(`frases_destacadas.insert: ${errInsert.message}`);
  }

  return { generadas: candidatos.length, detalle: candidatos.map((c) => c.texto) };
}

// "El campeonato de {clase} está al rojo vivo, ¿podrá {puntero} mantener
// la punta o {escolta} lo alcanzará?" (ajustado) o "{puntero} domina el
// campeonato..." (dominancia) -- las dos miran los mismos dos primeros de
// campeonato_puntos, así que se resuelven en un solo detector en vez de
// consultar la tabla dos veces por categoría. El corte entre una y otra es
// el promedio de puntos que el puntero se lleva por fecha (heurística
// simple para no depender de conocer la tabla de puntos exacta de Live
// Timing): diferencia <= ese promedio es "ajustado", > el doble es
// "dominancia", en el medio no hay historia clara todavía.
// deno-lint-ignore no-explicit-any
async function detectarSituacionCampeonato(sb: any, vigente: any, clase: any) {
  const { data: standings, error } = await sb
    .from("campeonato_puntos")
    .select("puntos, eventos_registrados, pilotos ( first_name, last_name )")
    .eq("campeonato_id", vigente.id)
    .eq("clase_id", clase.id)
    .order("puntos", { ascending: false })
    .limit(2);
  if (error) throw new Error(`campeonato_puntos.select (situación, ${clase.nombre}): ${error.message}`);
  if (!standings || standings.length < 2) return [];

  const [puntero, escolta] = standings;
  if (!puntero.puntos || puntero.puntos <= 0) return [];
  const diferencia = puntero.puntos - escolta.puntos;
  const puntosPorFecha = puntero.puntos / Math.max(1, puntero.eventos_registrados ?? 1);

  if (diferencia <= puntosPorFecha) {
    const texto = `El campeonato de ${claseCorta(clase.nombre)} está al rojo vivo, ¿podrá ${nombrePiloto(
      puntero.pilotos
    )} mantener la punta o ${nombrePiloto(escolta.pilotos)} lo alcanzará?`;
    return [{ texto, categoria: "campeonato_ajustado", clase_id: clase.id }];
  }
  if (diferencia > puntosPorFecha * 2) {
    const texto = `${nombrePiloto(puntero.pilotos)} domina el campeonato de ${claseCorta(
      clase.nombre
    )} con ${diferencia} puntos de ventaja sobre ${nombrePiloto(escolta.pilotos)}, ¿alguien podrá recortarle la diferencia?`;
    return [{ texto, categoria: "dominancia", clase_id: clase.id }];
  }
  return [];
}

// "¿Podrá {piloto} volver a ganar este año?" -- el campeón de la temporada
// INMEDIATA anterior (no todo el historial) todavía sin ganar ninguna
// fecha en la vigente.
// deno-lint-ignore no-explicit-any
async function detectarExCampeonSinGanar(sb: any, vigente: any, anterior: any, clase: any) {
  if (!anterior) return [];

  const { data: campeonAnterior, error: errAnterior } = await sb
    .from("campeonato_puntos")
    .select("piloto_id, puntos, pilotos ( first_name, last_name )")
    .eq("campeonato_id", anterior.id)
    .eq("clase_id", clase.id)
    .order("puntos", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errAnterior) throw new Error(`campeonato_puntos.select (ex campeón, ${clase.nombre}): ${errAnterior.message}`);
  if (!campeonAnterior || !campeonAnterior.puntos) return [];

  const { data: filaVigente, error: errVigente } = await sb
    .from("campeonato_puntos")
    .select("wins_1ro")
    .eq("campeonato_id", vigente.id)
    .eq("clase_id", clase.id)
    .eq("piloto_id", campeonAnterior.piloto_id)
    .maybeSingle();
  if (errVigente) throw new Error(`campeonato_puntos.select (ex campeón vigente, ${clase.nombre}): ${errVigente.message}`);
  // Si no corre esta temporada (sin fila) no hay historia que contar.
  if (!filaVigente || (filaVigente.wins_1ro ?? 0) > 0) return [];

  const texto = `¿Podrá ${nombrePiloto(campeonAnterior.pilotos)} volver a ganar una fecha de ${claseCorta(
    clase.nombre
  )} este año?`;
  return [{ texto, categoria: "ex_campeon", clase_id: clase.id }];
}

// "¿{piloto} ganará finalmente una fecha?" -- corrió bastante y subió al
// podio, pero nunca se subió al escalón más alto en esta temporada.
// deno-lint-ignore no-explicit-any
async function detectarNuncaGanoUnaFecha(sb: any, vigente: any, clase: any) {
  const { data: standings, error } = await sb
    .from("campeonato_puntos")
    .select("puntos, eventos_registrados, wins_1ro, wins_2do, wins_3ro, pilotos ( first_name, last_name )")
    .eq("campeonato_id", vigente.id)
    .eq("clase_id", clase.id)
    .order("puntos", { ascending: false });
  if (error) throw new Error(`campeonato_puntos.select (nunca ganó, ${clase.nombre}): ${error.message}`);

  const candidato = (standings ?? []).find(
    (fila: { eventos_registrados: number; wins_1ro: number; wins_2do: number; wins_3ro: number }) =>
      (fila.eventos_registrados ?? 0) >= MINIMO_EVENTOS_NUNCA_GANO &&
      (fila.wins_1ro ?? 0) === 0 &&
      ((fila.wins_2do ?? 0) > 0 || (fila.wins_3ro ?? 0) > 0)
  );
  if (!candidato) return [];

  const texto = `¿${nombrePiloto(candidato.pilotos)} ganará finalmente una fecha de ${claseCorta(clase.nombre)}?`;
  return [{ texto, categoria: "nunca_gano", clase_id: clase.id }];
}

// "{piloto} viene de ganar las últimas dos fechas de {clase}, ¿podrá
// quedarse también con la próxima?" -- mismo ganador (heat de la A Final,
// posición 1 -- la B numera continuando después de la A, nunca vuelve a 1)
// en las dos fechas corridas más recientes de la temporada vigente.
// `eventosCorridos` viene hoisteado desde generarFrases (últimas 4,
// desc por fecha) para no repetir esa consulta por cada detector.
// deno-lint-ignore no-explicit-any
async function detectarRachaVictorias(sb: any, eventosCorridos: any[], clase: any) {
  if (!eventosCorridos || eventosCorridos.length < 2) return [];
  const ultimos2 = eventosCorridos.slice(0, 2);

  const ganadores = [];
  for (const evento of ultimos2) {
    const { data: ganador, error } = await sb
      .from("resultados_finales")
      .select("piloto_id, pilotos ( first_name, last_name )")
      .eq("evento_id", evento.id)
      .eq("clase_id", clase.id)
      .eq("posicion", 1)
      .ilike("heat", "a%")
      .maybeSingle();
    if (error) throw new Error(`resultados_finales.select (racha victorias, ${clase.nombre}): ${error.message}`);
    if (!ganador) return []; // sin ganador claro en alguna de las dos -- no hay racha que contar
    ganadores.push(ganador);
  }

  if (ganadores[0].piloto_id !== ganadores[1].piloto_id) return [];

  const texto = `${nombrePiloto(ganadores[0].pilotos)} viene de ganar las últimas dos fechas de ${claseCorta(
    clase.nombre
  )}, ¿podrá quedarse también con la próxima?`;
  return [{ texto, categoria: "racha", clase_id: clase.id }];
}

// "{piloto} viene de subir al podio en las últimas tres fechas..." -- el
// mismo piloto entre los tres primeros (heat A) en cada una de las tres
// fechas corridas más recientes.
// deno-lint-ignore no-explicit-any
async function detectarRachaPodio(sb: any, eventosCorridos: any[], clase: any) {
  if (!eventosCorridos || eventosCorridos.length < 3) return [];
  const ultimos3 = eventosCorridos.slice(0, 3);

  // deno-lint-ignore no-explicit-any
  let interseccion: Map<string, any> | null = null;
  for (const evento of ultimos3) {
    const { data: podio, error } = await sb
      .from("resultados_finales")
      .select("piloto_id, pilotos ( first_name, last_name )")
      .eq("evento_id", evento.id)
      .eq("clase_id", clase.id)
      .lte("posicion", 3)
      .ilike("heat", "a%");
    if (error) throw new Error(`resultados_finales.select (racha podio, ${clase.nombre}): ${error.message}`);

    const idsEsteEvento = new Set((podio ?? []).map((p: { piloto_id: string }) => p.piloto_id));
    if (interseccion === null) {
      interseccion = new Map(
        (podio ?? []).map((p: { piloto_id: string; pilotos: unknown }) => [p.piloto_id, p.pilotos])
      );
    } else {
      for (const id of [...interseccion.keys()]) {
        if (!idsEsteEvento.has(id)) interseccion.delete(id);
      }
    }
    if (interseccion.size === 0) return [];
  }
  if (!interseccion || interseccion.size === 0) return [];

  const [, piloto] = [...interseccion.entries()][0];
  const texto = `${nombrePiloto(piloto)} viene de subir al podio en las últimas tres fechas de ${claseCorta(
    clase.nombre
  )}, ¿podrá mantener la racha?`;
  return [{ texto, categoria: "racha_podio", clase_id: clase.id }];
}

// "¿Podrá {piloto} volver al podio?" -- se subió al podio en algún momento
// de la temporada, pero no en ninguna de las últimas dos fechas corridas.
// deno-lint-ignore no-explicit-any
async function detectarSinPodio(sb: any, eventoIdsVigente: string[], eventosCorridos: any[], clase: any) {
  if (!eventosCorridos || eventosCorridos.length < 2 || eventoIdsVigente.length === 0) return [];
  const ultimos2Ids = eventosCorridos.slice(0, 2).map((e: { id: string }) => e.id);

  const { data: podiosRecientes, error: errRecientes } = await sb
    .from("resultados_finales")
    .select("piloto_id")
    .in("evento_id", ultimos2Ids)
    .eq("clase_id", clase.id)
    .lte("posicion", 3)
    .ilike("heat", "a%");
  if (errRecientes) throw new Error(`resultados_finales.select (sin podio recientes, ${clase.nombre}): ${errRecientes.message}`);
  const idsRecientes = new Set((podiosRecientes ?? []).map((p: { piloto_id: string }) => p.piloto_id));

  const { data: podiosHistoricos, error: errHistoricos } = await sb
    .from("resultados_finales")
    .select("piloto_id, pilotos ( first_name, last_name )")
    .in("evento_id", eventoIdsVigente)
    .eq("clase_id", clase.id)
    .lte("posicion", 3)
    .ilike("heat", "a%");
  if (errHistoricos) throw new Error(`resultados_finales.select (sin podio histórico, ${clase.nombre}): ${errHistoricos.message}`);

  const candidato = (podiosHistoricos ?? []).find((p: { piloto_id: string }) => !idsRecientes.has(p.piloto_id));
  if (!candidato) return [];

  const texto = `¿Podrá ${nombrePiloto(candidato.pilotos)} volver al podio de ${claseCorta(
    clase.nombre
  )}? No se sube hace las últimas dos fechas.`;
  return [{ texto, categoria: "sin_podio", clase_id: clase.id }];
}

// "{X} y {Y} se vienen alternando la victoria..." -- entre las últimas 3 o
// 4 fechas corridas (las que haya), exactamente dos pilotos se repartieron
// todas las victorias.
// deno-lint-ignore no-explicit-any
async function detectarVictoriaAlternada(sb: any, eventosCorridos: any[], clase: any) {
  if (!eventosCorridos || eventosCorridos.length < 3) return [];
  const muestra = eventosCorridos.slice(0, Math.min(4, eventosCorridos.length));

  const ganadores = [];
  for (const evento of muestra) {
    const { data: ganador, error } = await sb
      .from("resultados_finales")
      .select("piloto_id, pilotos ( first_name, last_name )")
      .eq("evento_id", evento.id)
      .eq("clase_id", clase.id)
      .eq("posicion", 1)
      .ilike("heat", "a%")
      .maybeSingle();
    if (error) throw new Error(`resultados_finales.select (alternada, ${clase.nombre}): ${error.message}`);
    if (!ganador) return [];
    ganadores.push(ganador);
  }

  const idsUnicos = [...new Set(ganadores.map((g) => g.piloto_id))];
  if (idsUnicos.length !== 2) return [];

  const nombreA = nombrePiloto(ganadores.find((g) => g.piloto_id === idsUnicos[0])?.pilotos);
  const nombreB = nombrePiloto(ganadores.find((g) => g.piloto_id === idsUnicos[1])?.pilotos);
  const texto = `${nombreA} y ${nombreB} se vienen alternando la victoria en ${claseCorta(
    clase.nombre
  )}, ¿quién se la queda esta vez?`;
  return [{ texto, categoria: "victoria_alternada", clase_id: clase.id }];
}

// "{piloto} sufrió N abandonos esta temporada..." -- cuenta las filas de
// resultados_finales cuyo texto crudo trae "(DNF)" (ver RESULTADO_RE en
// livetime_parsers.py / parsers.ts: "7/2:59.944 (DNF)"). Se filtra
// puntualmente DNF (abandonó en carrera) y no DNS/DQ (no largó /
// descalificado -- historias distintas, no es lo mismo "abandono").
// deno-lint-ignore no-explicit-any
async function detectarAbandonos(sb: any, eventoIdsVigente: string[], clase: any) {
  if (eventoIdsVigente.length === 0) return [];
  const { data: filas, error } = await sb
    .from("resultados_finales")
    .select("piloto_id, pilotos ( first_name, last_name )")
    .in("evento_id", eventoIdsVigente)
    .eq("clase_id", clase.id)
    .ilike("resultado", "%(DNF)%");
  if (error) throw new Error(`resultados_finales.select (abandonos, ${clase.nombre}): ${error.message}`);
  if (!filas || filas.length === 0) return [];

  // deno-lint-ignore no-explicit-any
  const conteos = new Map<string, { count: number; pilotos: any }>();
  for (const fila of filas) {
    const actual = conteos.get(fila.piloto_id) ?? { count: 0, pilotos: fila.pilotos };
    actual.count += 1;
    conteos.set(fila.piloto_id, actual);
  }
  const [, top] = [...conteos.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (top.count < MINIMO_ABANDONOS) return [];

  const texto = `${nombrePiloto(top.pilotos)} sufrió ${top.count} abandonos esta temporada en ${claseCorta(
    clase.nombre
  )}, ¿podrá dejarlos atrás con un fin de semana limpio?`;
  return [{ texto, categoria: "abandonos", clase_id: clase.id }];
}

// "{piloto} se llevó la vuelta más rápida en N fechas..." -- domina
// resultados_finales.vuelta_rapida pero convirtió menos victorias
// (wins_1ro) que vueltas rápidas se llevó -- le sobra ritmo, le falta
// cerrarlo en carrera.
// deno-lint-ignore no-explicit-any
async function detectarVueltasRapidasDominante(sb: any, eventoIdsVigente: string[], vigente: any, clase: any) {
  if (eventoIdsVigente.length === 0) return [];
  const { data: filas, error } = await sb
    .from("resultados_finales")
    .select("piloto_id, pilotos ( first_name, last_name )")
    .in("evento_id", eventoIdsVigente)
    .eq("clase_id", clase.id)
    .eq("vuelta_rapida", true);
  if (error) throw new Error(`resultados_finales.select (vuelta rápida, ${clase.nombre}): ${error.message}`);
  if (!filas || filas.length === 0) return [];

  // deno-lint-ignore no-explicit-any
  const conteos = new Map<string, { count: number; pilotos: any }>();
  for (const fila of filas) {
    const actual = conteos.get(fila.piloto_id) ?? { count: 0, pilotos: fila.pilotos };
    actual.count += 1;
    conteos.set(fila.piloto_id, actual);
  }
  const [pilotoId, top] = [...conteos.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (top.count < MINIMO_VUELTAS_RAPIDAS) return [];

  const { data: filaPuntos, error: errPuntos } = await sb
    .from("campeonato_puntos")
    .select("wins_1ro")
    .eq("campeonato_id", vigente.id)
    .eq("clase_id", clase.id)
    .eq("piloto_id", pilotoId)
    .maybeSingle();
  if (errPuntos) throw new Error(`campeonato_puntos.select (vuelta rápida wins, ${clase.nombre}): ${errPuntos.message}`);
  const wins = filaPuntos?.wins_1ro ?? 0;
  if (wins >= top.count) return []; // ya convierte la velocidad en victorias, no hay historia

  const texto = `${nombrePiloto(top.pilotos)} se llevó la vuelta más rápida en ${top.count} fechas de ${claseCorta(
    clase.nombre
  )} esta temporada, pero solo ganó ${wins} — ¿podrá traducir esa velocidad en más victorias?`;
  return [{ texto, categoria: "vuelta_rapida_dominante", clase_id: clase.id }];
}

// "{piloto} domina la clasificación..." -- mismo patrón que la de arriba,
// pero con TQs (pole position) en vez de vuelta más rápida en carrera:
// domina los sábados de clasificación pero no lo convierte en victorias
// los domingos. `campeonato_puntos.tqs` ya viene agregado por Live Timing,
// no hace falta ir a resultados_finales para esta.
// deno-lint-ignore no-explicit-any
async function detectarTQsDominante(sb: any, vigente: any, clase: any) {
  const { data: fila, error } = await sb
    .from("campeonato_puntos")
    .select("tqs, wins_1ro, pilotos ( first_name, last_name )")
    .eq("campeonato_id", vigente.id)
    .eq("clase_id", clase.id)
    .order("tqs", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`campeonato_puntos.select (tqs, ${clase.nombre}): ${error.message}`);
  if (!fila || (fila.tqs ?? 0) < MINIMO_TQS) return [];
  if ((fila.wins_1ro ?? 0) >= fila.tqs) return [];

  const texto = `${nombrePiloto(fila.pilotos)} domina la clasificación de ${claseCorta(clase.nombre)} (${
    fila.tqs
  } TQs esta temporada), pero todavía le cuesta convertirlo en victorias los domingos.`;
  return [{ texto, categoria: "tq_dominante", clase_id: clase.id }];
}

// "El récord de {clase} en {circuito} es de {piloto} con {tiempo}..." --
// si la PRÓXIMA fecha (no la última corrida) tiene un circuito+sentido
// asociado y ya hay un récord vigente cargado ahí para esta categoría.
// `proximaFecha` viene hoisteada desde generarFrases porque es la misma
// para todas las categorías -- no depende de `clase` salvo para buscar el
// récord puntual de cada una.
// deno-lint-ignore no-explicit-any
async function detectarRecordEnJuego(sb: any, proximaFecha: any, clase: any) {
  if (!proximaFecha || !proximaFecha.circuito_id) return [];
  const sentido = proximaFecha.circuito_sentido ?? "normal";

  const { data: record, error } = await sb
    .from("circuito_records")
    .select("piloto_nombre, tiempo")
    .eq("circuito_id", proximaFecha.circuito_id)
    .eq("clase_id", clase.id)
    .eq("sentido", sentido)
    .maybeSingle();
  if (error) throw new Error(`circuito_records.select (${clase.nombre}): ${error.message}`);
  if (!record) return [];

  const nombreCircuito = proximaFecha.circuitos?.nombre ?? "el circuito de la próxima fecha";
  const sentidoTexto = sentido === "invertido" ? "sentido invertido" : "sentido normal";
  const texto = `El récord de ${claseCorta(clase.nombre)} en ${nombreCircuito} (${sentidoTexto}) es de ${
    record.piloto_nombre
  } con ${record.tiempo} — ¿podrá alguien bajarlo en la próxima fecha?`;
  return [{ texto, categoria: "record_en_juego", clase_id: clase.id }];
}

// "En la clasificación de la última fecha, N autos quedaron adentro del
// segundo..." -- toma la mejor vuelta de clasificación (mínimo
// `fastest_lap` de resultados_ronda, filas sin DNF/DNS/DQ) de cada piloto
// en la fecha corrida más reciente, y cuenta cuántos quedaron a un
// segundo o menos del más rápido.
// deno-lint-ignore no-explicit-any
async function detectarAutosEnUnSegundo(sb: any, eventosCorridos: any[], clase: any) {
  if (!eventosCorridos || eventosCorridos.length === 0) return [];
  const ultimoEvento = eventosCorridos[0];

  const { data: rondas, error } = await sb
    .from("resultados_ronda")
    .select("piloto_id, fastest_lap, status, pilotos ( first_name, last_name )")
    .eq("evento_id", ultimoEvento.id)
    .eq("clase_id", clase.id)
    .is("status", null)
    .not("fastest_lap", "is", null);
  if (error) throw new Error(`resultados_ronda.select (autos apretados, ${clase.nombre}): ${error.message}`);
  if (!rondas || rondas.length === 0) return [];

  // deno-lint-ignore no-explicit-any
  const mejorPorPiloto = new Map<string, any>();
  for (const fila of rondas) {
    const actual = mejorPorPiloto.get(fila.piloto_id);
    if (!actual || fila.fastest_lap < actual.fastest_lap) mejorPorPiloto.set(fila.piloto_id, fila);
  }
  const mejores = [...mejorPorPiloto.values()].sort((a, b) => a.fastest_lap - b.fastest_lap);
  const poleTime = mejores[0].fastest_lap;
  const dentroDeUnSegundo = mejores.filter((f) => f.fastest_lap - poleTime <= UMBRAL_SEGUNDOS_AUTOS_APRETADOS);
  if (dentroDeUnSegundo.length < MINIMO_AUTOS_APRETADOS) return [];

  const texto = `En la clasificación de la última fecha, ${dentroDeUnSegundo.length} autos de ${claseCorta(
    clase.nombre
  )} quedaron adentro del segundo del más rápido (${nombrePiloto(mejores[0].pilotos)}) — se viene una definición cerrada.`;
  return [{ texto, categoria: "autos_apretados", clase_id: clase.id }];
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
