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
  parseGenericImport,
  parseResultadoCrudo,
  parseNombreCrudo,
} from "./parsers.ts";
import { PilotoResolver } from "./piloto_resolver.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const TIPOS_VALIDOS = ["pilotos", "resultadosFinales", "detalleRondas", "vueltaRapida", "campeonato"];

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
    const { eventoId, tipo, contenidoBase64, campeonatoId } = body ?? {};

    if (!eventoId || !tipo || !contenidoBase64) {
      return json({ error: "Faltan eventoId, tipo o contenidoBase64" }, 400, cors);
    }
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return json({ error: `Tipo desconocido: ${tipo}` }, 400, cors);
    }

    const bytes = base64ToBytes(contenidoBase64);
    const resolver = new PilotoResolver(sb);
    let resumen: string;

    switch (tipo) {
      case "pilotos":
        resumen = await syncPilotos(sb, bytes);
        break;
      case "resultadosFinales":
        resumen = await syncFinalResults(sb, bytes, eventoId, resolver);
        break;
      case "detalleRondas":
        resumen = await syncRoundResults(sb, bytes, eventoId, resolver);
        break;
      case "vueltaRapida":
        resumen = await syncTopTimes(sb, bytes, eventoId, resolver);
        break;
      case "campeonato":
        if (!campeonatoId) return json({ error: "Falta campeonatoId" }, 400, cors);
        resumen = await syncCampeonato(sb, bytes, campeonatoId, resolver);
        break;
      default:
        return json({ error: `Tipo desconocido: ${tipo}` }, 400, cors);
    }

    await marcarArchivo(sb, eventoId, tipo);

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
  await sb.from("eventos").update({ archivos }).eq("id", eventoId);
}

async function syncPilotos(sb: SupabaseClient, bytes: Uint8Array): Promise<string> {
  const pilotos = parseGenericImport(bytes);
  let count = 0;
  for (const p of pilotos) {
    const first = p["FirstName"];
    const last = p["LastName"];
    if (!first || !last) continue;

    const { data: existente } = await sb
      .from("pilotos")
      .select("id")
      .ilike("first_name", first)
      .ilike("last_name", last)
      .maybeSingle();

    const campos = {
      first_name: first,
      last_name: last,
      phonetic_name: p["PhoneticName"] ?? null,
      country: p["Country"] ?? null,
      permanent_number: p["PermanentNumber"] ? String(p["PermanentNumber"]) : null,
      transponder_number: p["TransponderNumber"] ? String(p["TransponderNumber"]) : null,
      chassis_manufacturer: p["ChassisManufacturer"] ?? null,
    };

    if (existente) {
      await sb.from("pilotos").update(campos).eq("id", existente.id);
    } else {
      await sb.from("pilotos").insert(campos);
    }
    count++;
  }
  return `${count} pilotos sincronizados`;
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

    await sb.from("resultados_finales").upsert(
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

    await sb.from("resultados_ronda").upsert(
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

    await sb
      .from("resultados_finales")
      .update({ vuelta_rapida: true })
      .eq("evento_id", eventoId)
      .eq("clase_id", claseId)
      .eq("piloto_id", pilotoId);
    count++;
  }
  return `Vuelta rápida marcada (${count})`;
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

    await sb.from("campeonato_puntos").upsert(
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
    count++;
  }
  return `${count} filas de campeonato sincronizadas`;
}
