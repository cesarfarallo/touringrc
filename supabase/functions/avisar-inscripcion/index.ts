// Edge Function: avisa por email a los pilotos opt-in cuando se habilita la
// inscripción online de una fecha (migración 0026). Pensada para correr una
// vez por día vía pg_cron (ver README.md de esta carpeta) -- no hay sesión
// de usuario de por medio, así que la protección es un secreto compartido
// (CRON_SECRET) en vez del JWT que usa subir-resultado.
//
// Deploy: supabase functions deploy avisar-inscripcion --no-verify-jwt
// (--no-verify-jwt porque la llama pg_cron/pg_net, no un usuario logueado --
// la Authorization header que Supabase espera por default no aplica acá)
//
// Secrets que hay que configurar a mano (Dashboard → Edge Functions →
// avisar-inscripcion → Secrets, o `supabase secrets set`):
//   CRON_SECRET   -- string random, el mismo que se manda en el header
//                    x-cron-secret desde pg_cron/curl. Nunca commitear el
//                    valor real.
//   RESEND_API_KEY -- API key de la cuenta de Resend del club.
//   RESEND_FROM    -- remitente verificado en Resend, ej.
//                    "Touring 1:10 Arg <avisos@tudominio.com>".
//   SITE_URL       -- opcional, ej. "https://touringrc.vercel.app" -- si no
//                    está seteada, el mail no incluye un link directo.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM");
const SITE_URL = Deno.env.get("SITE_URL");

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!CRON_SECRET) return json({ error: "Falta configurar el secret CRON_SECRET" }, 500);
    if (req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "Secreto inválido" }, 401);
    if (!RESEND_API_KEY || !RESEND_FROM) {
      return json({ error: "Falta configurar RESEND_API_KEY / RESEND_FROM" }, 500);
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const resultados = await avisarEventosQueAbrieron(sb);
    return json({ ok: true, resultados }, 200);
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});

// Mismo criterio que inscripcionAbierta() en web/src/components/EventoCard.jsx
// (abierta desde fecha - inscripcion_dias_antes hasta el día anterior a
// fecha), pero comparado en UTC en vez de horario local -- corriendo una
// vez por día esa diferencia de husos no cambia qué día se manda el aviso
// en la práctica, así que no hace falta replicar el `Date` del navegador acá.
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function restarDias(fechaISO: string, dias: number): string {
  const d = new Date(fechaISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

// deno-lint-ignore no-explicit-any
async function avisarEventosQueAbrieron(sb: any) {
  const hoy = hoyISO();

  const { data: eventos, error: errEventos } = await sb
    .from("eventos")
    .select("id, nombre, fecha, inscripcion_dias_antes")
    .not("inscripcion_dias_antes", "is", null)
    .eq("notificacion_inscripcion_enviada", false);
  if (errEventos) throw new Error(`eventos.select: ${errEventos.message}`);

  const abiertos = (eventos ?? []).filter((e: { fecha: string; inscripcion_dias_antes: number }) => {
    const desde = restarDias(e.fecha, e.inscripcion_dias_antes);
    return hoy >= desde && hoy < e.fecha;
  });

  const resultados = [];
  for (const evento of abiertos) {
    resultados.push(await avisarEvento(sb, evento));
  }
  return resultados;
}

// deno-lint-ignore no-explicit-any
async function avisarEvento(sb: any, evento: { id: string; nombre: string; fecha: string }) {
  const { data: pilotos, error: errPilotos } = await sb
    .from("pilotos")
    .select("email")
    .eq("acepta_notificaciones", true)
    .not("email", "is", null);
  if (errPilotos) throw new Error(`pilotos.select (${evento.nombre}): ${errPilotos.message}`);

  const destinatarios = (pilotos ?? []).map((p: { email: string }) => p.email).filter(Boolean);

  if (destinatarios.length > 0) {
    await enviarLote(evento, destinatarios);
  }

  // Se marca enviado igual con 0 destinatarios opt-in -- es un aviso de
  // "se abrió esta fecha", no algo que tenga sentido reintentar todos los
  // días mientras nadie esté suscripto todavía.
  const { error: errUpdate } = await sb
    .from("eventos")
    .update({ notificacion_inscripcion_enviada: true })
    .eq("id", evento.id);
  if (errUpdate) throw new Error(`eventos.update (${evento.nombre}): ${errUpdate.message}`);

  return { evento: evento.nombre, enviados: destinatarios.length };
}

async function enviarLote(evento: { nombre: string; fecha: string }, destinatarios: string[]) {
  const fechaStr = new Date(`${evento.fecha}T00:00:00Z`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const link = SITE_URL ? `<p><a href="${SITE_URL}">Inscribite acá</a></p>` : "";
  const html = `
    <p>¡Se abrió la inscripción para <strong>${evento.nombre}</strong> (${fechaStr})!</p>
    <p>Entrá a la web del club para anotarte.</p>
    ${link}
    <p style="color:#8B9296;font-size:12px;">
      Recibís este aviso porque activaste la opción "Avisarme cuando abra inscripción" en tu perfil.
      Podés desactivarla en cualquier momento desde ahí.
    </p>
  `;

  // Batch de Resend: cada entrada es un email individual e independiente
  // (nadie ve el email de otro piloto) -- hasta 100 por request, y con la
  // cantidad de pilotos de un club chico alcanza con un solo llamado.
  const lote = [];
  for (let i = 0; i < destinatarios.length; i += 100) {
    lote.push(destinatarios.slice(i, i + 100));
  }

  for (const grupo of lote) {
    const body = grupo.map((email) => ({
      from: RESEND_FROM,
      to: [email],
      subject: `Se abrió la inscripción para ${evento.nombre}`,
      html,
    }));
    const resp = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const texto = await resp.text();
      throw new Error(`Resend (${evento.nombre}): ${resp.status} ${texto}`);
    }
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
