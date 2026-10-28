// Edge Function: recordatorio periódico (cada ~2 días) por email a los
// pilotos opt-in (`pilotos.acepta_notificaciones = true`) que TODAVÍA no se
// anotaron a la fecha vigente -- a diferencia de `avisar-inscripcion`
// (migración 0026, un aviso único de "se abrió la inscripción"), este se
// repite mientras la ventana siga abierta, y solo a quien no se anotó
// (migración 0031). Pensada para correr vía pg_cron (ver README.md de esta
// carpeta) -- sin sesión de usuario de por medio, protegida con el mismo
// tipo de secreto compartido (CRON_SECRET) que el resto de las funciones de
// cron de este proyecto.
//
// Deploy: supabase functions deploy recordatorio-inscripcion --no-verify-jwt
//
// Secrets (reusa los mismos que avisar-inscripcion, mismo proyecto):
//   CRON_SECRET, RESEND_API_KEY, RESEND_FROM, SITE_URL
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM");
const SITE_URL = Deno.env.get("SITE_URL")?.replace(/\/$/, "");

const DIAS_ENTRE_RECORDATORIOS = 2;

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!CRON_SECRET) return json({ error: "Falta configurar el secret CRON_SECRET" }, 500);
    if (req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "Secreto inválido" }, 401);
    if (!RESEND_API_KEY || !RESEND_FROM) {
      return json({ error: "Falta configurar RESEND_API_KEY / RESEND_FROM" }, 500);
    }
    if (!SITE_URL) return json({ error: "Falta configurar SITE_URL" }, 500);

    let forzar = false;
    try {
      const body = await req.json();
      forzar = body?.forzar === true;
    } catch {
      // sin body (ej. el cron manda "{}" o nada) -- forzar queda en false
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const resultados = await recordarEventosAbiertos(sb, forzar);
    return json({ ok: true, resultados }, 200);
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});

// Mismo criterio que inscripcionAbierta() en web/src/components/EventoCard.jsx
// (abierta desde fecha - inscripcion_dias_antes hasta el día anterior a
// fecha), comparado en UTC -- mismo motivo que avisar-inscripcion (corriendo
// una vez por día la diferencia de husos no cambia qué día se manda).
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function restarDias(fechaISO: string, dias: number): string {
  const d = new Date(fechaISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

function sumarDias(fechaISO: string, dias: number): string {
  const d = new Date(fechaISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// deno-lint-ignore no-explicit-any
async function recordarEventosAbiertos(sb: any, forzar: boolean) {
  const hoy = hoyISO();

  const { data: eventos, error: errEventos } = await sb
    .from("eventos")
    .select("id, nombre, fecha, inscripcion_dias_antes, ultimo_recordatorio_inscripcion")
    .not("inscripcion_dias_antes", "is", null);
  if (errEventos) throw new Error(`eventos.select: ${errEventos.message}`);

  const abiertos = (eventos ?? []).filter(
    (e: { fecha: string; inscripcion_dias_antes: number }) => {
      const desde = restarDias(e.fecha, e.inscripcion_dias_antes);
      return hoy >= desde && hoy < e.fecha;
    }
  );

  const resultados = [];
  for (const evento of abiertos) {
    if (!forzar) {
      // El primer recordatorio no sale el mismo día que abre la ventana --
      // arranca recién DIAS_ENTRE_RECORDATORIOS días después de esa
      // apertura (`desde`, no la fecha del evento), para no apurar al
      // piloto apenas se habilita. `ultimo_recordatorio_inscripcion` sigue
      // null hasta el primer envío real, así que ese piso hay que
      // calcularlo aparte -- no alcanza con "esperar 2 días desde el
      // último", que sin esto nunca aplica la primera vez.
      const desde = restarDias(evento.fecha, evento.inscripcion_dias_antes);
      const primerElegible = sumarDias(desde, DIAS_ENTRE_RECORDATORIOS);
      if (hoy < primerElegible) {
        resultados.push({
          evento: evento.nombre,
          enviados: 0,
          motivo: `el primer recordatorio arranca ${DIAS_ENTRE_RECORDATORIOS} días después de que abrió la inscripción (${primerElegible})`,
        });
        continue;
      }

      if (evento.ultimo_recordatorio_inscripcion) {
        const horasPasadas =
          (Date.now() - new Date(evento.ultimo_recordatorio_inscripcion).getTime()) / (1000 * 60 * 60);
        if (horasPasadas < DIAS_ENTRE_RECORDATORIOS * 24) {
          resultados.push({
            evento: evento.nombre,
            enviados: 0,
            motivo: `todavía no pasaron ${DIAS_ENTRE_RECORDATORIOS} días desde el último recordatorio`,
            ultimo_recordatorio: evento.ultimo_recordatorio_inscripcion,
          });
          continue;
        }
      }
    }
    resultados.push(await recordarEvento(sb, evento));
  }
  return resultados;
}

// deno-lint-ignore no-explicit-any
async function recordarEvento(sb: any, evento: { id: string; nombre: string; fecha: string }) {
  const { data: pilotos, error: errPilotos } = await sb
    .from("pilotos")
    .select("id, email")
    .eq("acepta_notificaciones", true)
    .not("email", "is", null);
  if (errPilotos) throw new Error(`pilotos.select (${evento.nombre}): ${errPilotos.message}`);

  const { data: inscriptos, error: errInscriptos } = await sb
    .from("inscripciones")
    .select("piloto_id")
    .eq("evento_id", evento.id);
  if (errInscriptos) throw new Error(`inscripciones.select (${evento.nombre}): ${errInscriptos.message}`);
  const idsYaInscriptos = new Set((inscriptos ?? []).map((i: { piloto_id: string }) => i.piloto_id));

  const destinatarios = (pilotos ?? [])
    .filter((p: { id: string }) => !idsYaInscriptos.has(p.id))
    .map((p: { email: string }) => p.email)
    .filter(Boolean);

  if (destinatarios.length > 0) {
    await enviarLote(evento, destinatarios);
  }

  // Se actualiza el timestamp igual con 0 destinatarios -- es un ciclo de
  // recordatorio ("todavía falta avisar a quien no se anotó"), no algo que
  // tenga sentido reintentar todos los días mientras no haya nadie
  // pendiente en ese momento puntual.
  const { error: errUpdate } = await sb
    .from("eventos")
    .update({ ultimo_recordatorio_inscripcion: new Date().toISOString() })
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
  const logo = `<img src="${SITE_URL}/logo.png" alt="Touring 1:10 Arg" width="120" height="120" style="display:block;width:120px;height:120px;margin:0 auto 16px;" />`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;">
      ${logo}
      <p>Todavía no te anotaste para <strong>${evento.nombre}</strong> (${fechaStr}).</p>
      <p>La inscripción cierra el día anterior a la fecha -- entrá a la web para anotarte antes
      de que se cierre.</p>
      <p style="text-align:center;"><a href="${SITE_URL}">Inscribite acá</a></p>
      <p style="color:#8B9296;font-size:12px;">
        Recibís este recordatorio porque activaste la opción "Avisarme cuando abra inscripción"
        en tu perfil y todavía no estás anotado para esta fecha. Dejás de recibirlo en cuanto te
        anotes, o si desactivás la opción desde tu perfil.
      </p>
    </div>
  `;

  // Mismo patrón de lotes de a 100 que avisar-inscripcion (límite de Resend
  // /emails/batch) -- cada entrada es un mensaje independiente, nadie ve el
  // email de otro piloto.
  const lote = [];
  for (let i = 0; i < destinatarios.length; i += 100) {
    lote.push(destinatarios.slice(i, i + 100));
  }

  for (const grupo of lote) {
    const body = grupo.map((email) => ({
      from: RESEND_FROM,
      to: [email],
      subject: `Todavía no te anotaste para ${evento.nombre}`,
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
