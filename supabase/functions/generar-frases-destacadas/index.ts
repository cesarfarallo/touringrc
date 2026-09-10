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
// "una vez por día" y de igual forma el set solo cambia cada 3 días. Se
// puede forzar una regeneración inmediata mandando `{"forzar": true}` en
// el body (útil para probar sin esperar).
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
// Cuántos eventos como mínimo tiene que tener corridos un piloto para que
// "nunca ganó una fecha" cuente como una historia real, no un piloto que
// recién arranca.
const MINIMO_EVENTOS_NUNCA_GANO = 3;

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
  return [piloto.first_name, piloto.last_name].filter(Boolean).join(" ") || "un piloto";
}

// Mismo criterio que el frontend (App.jsx / ResultadosHistoricos.jsx) para
// acortar el nombre de la categoría en textos: "Touring Eco Modified" ->
// "Modified".
function claseCorta(nombre: string) {
  return nombre.replace("Touring Eco ", "");
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

  const candidatos: { texto: string; categoria: string; clase_id: string }[] = [];
  for (const clase of clases ?? []) {
    candidatos.push(...(await detectarCampeonatoAjustado(sb, vigente, clase)));
    candidatos.push(...(await detectarExCampeonSinGanar(sb, vigente, anterior, clase)));
    candidatos.push(...(await detectarNuncaGanoUnaFecha(sb, vigente, clase)));
    candidatos.push(...(await detectarRachaUltimoEvento(sb, vigente, clase)));
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
// la punta o {escolta} lo alcanzará?" -- puntero y escolta separados por
// menos que el promedio de puntos que otorga una fecha (heurística simple
// que no depende de conocer la tabla de puntos exacta de Live Timing).
// deno-lint-ignore no-explicit-any
async function detectarCampeonatoAjustado(sb: any, vigente: any, clase: any) {
  const { data: standings, error } = await sb
    .from("campeonato_puntos")
    .select("puntos, eventos_registrados, pilotos(first_name, last_name)")
    .eq("campeonato_id", vigente.id)
    .eq("clase_id", clase.id)
    .order("puntos", { ascending: false })
    .limit(2);
  if (error) throw new Error(`campeonato_puntos.select (ajustado, ${clase.nombre}): ${error.message}`);
  if (!standings || standings.length < 2) return [];

  const [puntero, escolta] = standings;
  if (!puntero.puntos || puntero.puntos <= 0) return [];
  const diferencia = puntero.puntos - escolta.puntos;
  const puntosPorFecha = puntero.puntos / Math.max(1, puntero.eventos_registrados ?? 1);
  if (diferencia > puntosPorFecha) return [];

  const texto = `El campeonato de ${claseCorta(clase.nombre)} está al rojo vivo, ¿podrá ${nombrePiloto(
    puntero.pilotos
  )} mantener la punta o ${nombrePiloto(escolta.pilotos)} lo alcanzará?`;
  return [{ texto, categoria: "campeonato_ajustado", clase_id: clase.id }];
}

// "¿Podrá {piloto} volver a ganar este año?" -- el campeón de la temporada
// INMEDIATA anterior (no todo el historial) todavía sin ganar ninguna
// fecha en la vigente.
// deno-lint-ignore no-explicit-any
async function detectarExCampeonSinGanar(sb: any, vigente: any, anterior: any, clase: any) {
  if (!anterior) return [];

  const { data: campeonAnterior, error: errAnterior } = await sb
    .from("campeonato_puntos")
    .select("piloto_id, puntos, pilotos(first_name, last_name)")
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
    .select("puntos, eventos_registrados, wins_1ro, wins_2do, wins_3ro, pilotos(first_name, last_name)")
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
// deno-lint-ignore no-explicit-any
async function detectarRachaUltimoEvento(sb: any, vigente: any, clase: any) {
  const { data: eventos, error: errEventos } = await sb
    .from("eventos")
    .select("id, fecha")
    .eq("campeonato_id", vigente.id)
    .eq("corrida", true)
    .order("fecha", { ascending: false })
    .limit(2);
  if (errEventos) throw new Error(`eventos.select (racha, ${clase.nombre}): ${errEventos.message}`);
  if (!eventos || eventos.length < 2) return [];

  const ganadores = [];
  for (const evento of eventos) {
    const { data: ganador, error: errGanador } = await sb
      .from("resultados_finales")
      .select("piloto_id, pilotos(first_name, last_name)")
      .eq("evento_id", evento.id)
      .eq("clase_id", clase.id)
      .eq("posicion", 1)
      .ilike("heat", "a%")
      .maybeSingle();
    if (errGanador) throw new Error(`resultados_finales.select (racha, ${clase.nombre}): ${errGanador.message}`);
    if (!ganador) return []; // sin ganador claro en alguna de las dos -- no hay racha que contar
    ganadores.push(ganador);
  }

  if (ganadores[0].piloto_id !== ganadores[1].piloto_id) return [];

  const texto = `${nombrePiloto(ganadores[0].pilotos)} viene de ganar las últimas dos fechas de ${claseCorta(
    clase.nombre
  )}, ¿podrá quedarse también con la próxima?`;
  return [{ texto, categoria: "racha", clase_id: clase.id }];
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
