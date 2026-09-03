// Edge Function: recibe un archivo exportado de Live Timing desde el panel
// admin (Gestión de eventos), lo parsea y hace upsert en Supabase. Port de
// touringrc-sync/sync_evento.py -- misma lógica, pero corriendo server-side
// acá en vez de en la PC del admin, así funciona subiendo el archivo desde
// el navegador.
//
// Deploy: supabase functions deploy subir-resultado
// (usa las env vars SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY
// que Supabase inyecta automáticamente, no hace falta configurar secrets)
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  parseFinalResults,
  parseRoundResult,
  parseTopTimes,
  parseSeriesResult,
  parseLeaderboard,
  parseRecordsCircuito,
  parseResultadoCrudo,
  parseNombreCrudo,
} from "./parsers.ts";
import { PilotoResolver } from "./piloto_resolver.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const TIPOS_VALIDOS = ["resultadosFinales", "detalleRondas", "vueltaRapida", "clasificacion", "campeonato", "recordsCircuito"];

Deno.serve(async (req: Request) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return json({ error: "Falta autenticación" }, 401, cors);

    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await anon.auth.getUser(jwt);
    if (userError || !userData?.user) return json({ error: "Sesión inválida" }, 401, cors);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Mismo criterio que es_admin() en Postgres: ¿el piloto vinculado a
    // esta sesión tiene el rol 'admin'?
    const { data: piloto } = await sb
      .from("pilotos")
      .select("id, piloto_roles ( rol_id )")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    // deno-lint-ignore no-explicit-any
    const roles = (piloto?.piloto_roles ?? []).map((r: any) => r.rol_id);
    if (!roles.includes("admin")) return json({ error: "Solo un admin puede subir resultados" }, 403, cors);

    const body = await req.json();
    const { eventoId, tipo, contenidoBase64, campeonatoId, circuitoId, sentido } = body ?? {};

    if (!tipo || !contenidoBase64) {
      return json({ error: "Faltan tipo o contenidoBase64" }, 400, cors);
    }
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return json({ error: `Tipo desconocido: ${tipo}` }, 400, cors);
    }
    // recordsCircuito no está atado a un evento -- va contra un circuito
    // (y un sentido: los récords se guardan por separado para normal e
    // invertido, ver migración 0014).
    if (tipo !== "recordsCircuito" && !eventoId) {
      return json({ error: "Falta eventoId" }, 400, cors);
    }
    if (tipo === "recordsCircuito" && (!circuitoId || !sentido)) {
      return json({ error: "Faltan circuitoId o sentido" }, 400, cors);
    }

    const bytes = base64ToBytes(contenidoBase64);
    const resolver = new PilotoResolver(sb);
    let resumen: string;

    switch (tipo) {
      case "resultadosFinales":
        resumen = await syncFinalResults(sb, bytes, eventoId, resolver);
        break;
      case "detalleRondas":
        resumen = await syncRoundResults(sb, bytes, eventoId, resolver);
        break;
      case "vueltaRapida":
        resumen = await syncTopTimes(sb, bytes, eventoId, resolver);
        break;
      case "clasificacion":
        resumen = await syncClasificacion(sb, bytes, eventoId, resolver);
        break;
      case "campeonato":
        if (!campeonatoId) return json({ error: "Falta campeonatoId" }, 400, cors);
        resumen = await syncCampeonato(sb, bytes, campeonatoId, resolver);
        break;
      case "recordsCircuito":
        resumen = await syncRecordsCircuito(sb, bytes, circuitoId, sentido);
        break;
      default:
        return json({ error: `Tipo desconocido: ${tipo}` }, 400, cors);
    }

    if (eventoId) {
      await marcarArchivo(sb, eventoId, tipo);
      // FinalResults.xls es la señal definitiva de que el evento ya se corrió
      // -- `corrida` arrancaba en `false` y nada la prendía sola salvo el seed
      // inicial, así que cualquier fecha nueva cargada desde la web quedaba
      // invisible para siempre en el filtro de la sección Resultados.
      if (tipo === "resultadosFinales") {
        const { error: errCorrida } = await sb.from("eventos").update({ corrida: true }).eq("id", eventoId);
        if (errCorrida) throw new Error(`eventos.update corrida: ${errCorrida.message}`);
      }
    }

    return json({ ok: true, resumen }, 200, cors);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500, cors);
  }
});

function json(body: unknown, status: number, extraHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function toFloat(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  if (s.includes(":")) {
    const [m, sec] = s.split(":");
    const n = parseFloat(m) * 60 + parseFloat(sec);
    return Number.isNaN(n) ? null : n;
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

async function getOrCreateClase(sb: SupabaseClient, nombre: string): Promise<string> {
  const { data } = await sb.from("clases").select("id").eq("nombre", nombre).maybeSingle();
  if (data) return data.id;
  const { data: nuevo, error } = await sb.from("clases").insert({ nombre }).select("id").single();
  if (error) throw error;
  return nuevo.id;
}

async function marcarArchivo(sb: SupabaseClient, eventoId: string, tipo: string) {
  const { data: ev } = await sb.from("eventos").select("archivos").eq("id", eventoId).maybeSingle();
  const archivos = { ...(ev?.archivos ?? {}), [tipo]: true };
  const { error } = await sb.from("eventos").update({ archivos }).eq("id", eventoId);
  if (error) throw new Error(`eventos.update archivos: ${error.message}`);
}

async function syncFinalResults(
  sb: SupabaseClient,
  bytes: Uint8Array,
  eventoId: string,
  resolver: PilotoResolver
): Promise<string> {
  const filas = parseFinalResults(bytes);
  let count = 0;
  for (const f of filas) {
    const pilotoId = await resolver.resolverOAvisar(f.pilotoCrudo);
    if (!pilotoId) continue;
    const claseId = await getOrCreateClase(sb, f.clase);
    const { flags } = parseNombreCrudo(f.pilotoCrudo);

    const { error } = await sb.from("resultados_finales").upsert(
      {
        evento_id: eventoId,
        clase_id: claseId,
        piloto_id: pilotoId,
        posicion: f.posicion,
        resultado: f.resultadoCrudo,
        heat: f.heat,
        tq: flags.includes("TQ"),
      },
      { onConflict: "evento_id,clase_id,piloto_id" }
    );
    if (error) throw new Error(`resultados_finales.upsert (${f.pilotoCrudo}): ${error.message}`);
    count++;
  }
  return `${count} resultados finales sincronizados`;
}

async function syncRoundResults(
  sb: SupabaseClient,
  bytes: Uint8Array,
  eventoId: string,
  resolver: PilotoResolver
): Promise<string> {
  const filas = parseRoundResult(bytes);
  let count = 0;
  for (const f of filas) {
    const pilotoId = await resolver.resolverOAvisar(f.pilotoCrudo);
    if (!pilotoId) continue;
    const claseId = await getOrCreateClase(sb, f.clase);
    const r = parseResultadoCrudo(f.lapsTimeCrudo);

    const { error } = await sb.from("resultados_ronda").upsert(
      {
        evento_id: eventoId,
        clase_id: claseId,
        ronda: `${f.ronda}-heat${f.heat}`,
        piloto_id: pilotoId,
        posicion: f.posicion,
        vueltas: r?.vueltas ?? null,
        status: r?.status ?? null,
        fastest_lap: toFloat(f.fastLap),
        avg_lap: toFloat(f.avgLap),
        top5_avg: toFloat(f.top5Avg),
        top10_avg: toFloat(f.top10Avg),
        top15_avg: toFloat(f.top15Avg),
        top3_consecutive: toFloat(f.top3Consecutive),
      },
      { onConflict: "evento_id,clase_id,ronda,piloto_id" }
    );
    if (error) throw new Error(`resultados_ronda.upsert (${f.pilotoCrudo}, ${f.ronda}): ${error.message}`);
    count++;
  }
  return `${count} filas de detalle de ronda sincronizadas`;
}

async function syncTopTimes(
  sb: SupabaseClient,
  bytes: Uint8Array,
  eventoId: string,
  resolver: PilotoResolver
): Promise<string> {
  const filas = parseTopTimes(bytes);
  let count = 0;
  for (const f of filas) {
    if (!f.vueltaRapida) continue;
    const pilotoId = await resolver.resolverOAvisar(f.pilotoCrudo);
    if (!pilotoId) continue;
    const claseId = await getOrCreateClase(sb, f.clase);

    const { data, error } = await sb
      .from("resultados_finales")
      .update({ vuelta_rapida: true })
      .eq("evento_id", eventoId)
      .eq("clase_id", claseId)
      .eq("piloto_id", pilotoId)
      .select("id");
    if (error) throw new Error(`resultados_finales.update vuelta_rapida (${f.pilotoCrudo}): ${error.message}`);
    count += data?.length ?? 0;
  }
  return count > 0
    ? `Vuelta rápida marcada (${count})`
    : "No se encontró ningún resultado final para marcar; subí primero FinalResults.xls";
}

async function syncClasificacion(
  sb: SupabaseClient,
  bytes: Uint8Array,
  eventoId: string,
  resolver: PilotoResolver
): Promise<string> {
  const filas = parseLeaderboard(bytes);
  let count = 0;
  for (const f of filas) {
    const pilotoId = await resolver.resolverOAvisar(f.pilotoCrudo);
    if (!pilotoId) continue;
    const claseId = await getOrCreateClase(sb, f.clase);

    const { error } = await sb.from("clasificacion").upsert(
      {
        evento_id: eventoId,
        clase_id: claseId,
        piloto_id: pilotoId,
        posicion: f.posicion,
        resultado: f.resultadoCrudo,
        rondas: f.rondas,
        tie_breaker: f.tieBreaker,
      },
      { onConflict: "evento_id,clase_id,piloto_id" }
    );
    if (error) throw new Error(`clasificacion.upsert (${f.pilotoCrudo}): ${error.message}`);
    count++;
  }
  return `${count} filas de clasificación sincronizadas`;
}

async function syncCampeonato(
  sb: SupabaseClient,
  bytes: Uint8Array,
  campeonatoId: string,
  resolver: PilotoResolver
): Promise<string> {
  const { filas } = parseSeriesResult(bytes);
  let count = 0;
  for (const f of filas) {
    const pilotoId = await resolver.resolverOAvisar(f.pilotoCrudo);
    if (!pilotoId) continue;
    const claseId = await getOrCreateClase(sb, f.clase);

    const { error } = await sb.from("campeonato_puntos").upsert(
      {
        campeonato_id: campeonatoId,
        clase_id: claseId,
        piloto_id: pilotoId,
        posicion: f.posicion,
        puntos: f.puntos,
        puntos_sin_descartes: f.puntosSinDescartes,
        ajuste_puntos: f.ajustePuntos,
        eventos_registrados: f.eventosRegistrados,
        tqs: f.tqs,
        wins_1ro: f.wins1ro,
        wins_2do: f.wins2do,
        wins_3ro: f.wins3ro,
        detalle_por_fecha: f.detallePorFecha,
      },
      { onConflict: "campeonato_id,clase_id,piloto_id" }
    );
    if (error) throw new Error(`campeonato_puntos.upsert (${f.pilotoCrudo}): ${error.message}`);
    count++;
  }
  return `${count} filas de campeonato sincronizadas`;
}

// RaceResultRecords*.xls ("Track Records"): pisa el récord vigente de
// cada categoría para este circuito -- circuito_records guarda el
// récord actual, no un historial, así que un upsert alcanza ("el
// reporte siempre trae lo mejor"). Solo se importan las categorías cuyo
// nombre matchea exacto con una fila de `clases` ya cargada -- el
// reporte puede traer más categorías de las que el club usa, y no
// tiene sentido crear clases nuevas a partir de un archivo de récords.
async function syncRecordsCircuito(sb: SupabaseClient, bytes: Uint8Array, circuitoId: string, sentido: string): Promise<string> {
  const filas = parseRecordsCircuito(bytes);
  let count = 0;
  const ignoradas: string[] = [];

  for (const f of filas) {
    const { data: clase } = await sb.from("clases").select("id").eq("nombre", f.clase).maybeSingle();
    if (!clase) {
      if (!ignoradas.includes(f.clase)) ignoradas.push(f.clase);
      continue;
    }

    const { error } = await sb.from("circuito_records").upsert(
      {
        circuito_id: circuitoId,
        clase_id: clase.id,
        sentido,
        piloto_nombre: f.pilotoNombre,
        tiempo: f.tiempo,
        fecha: f.fechaIso,
      },
      { onConflict: "circuito_id,clase_id,sentido" }
    );
    if (error) throw new Error(`circuito_records.upsert (${f.clase}): ${error.message}`);
    count++;
  }

  let resumen = `${count} récord(es) actualizados`;
  if (ignoradas.length > 0) resumen += ` (se ignoraron categorías sin clase asociada: ${ignoradas.join(", ")})`;
  return resumen;
}
