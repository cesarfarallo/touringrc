// Edge Function: sube la foto de un piloto (migración 0030). A diferencia
// de subir-resultado (solo admin), acá hay DOS formas válidas de estar
// autorizado: ser el propio piloto (subir tu propia foto desde Mi Perfil)
// o ser admin (cambiar la de cualquiera desde el módulo Pilotos) -- la
// función resuelve cuál es el piloto vinculado a la sesión y su rol, y
// recién ahí decide si puede tocar el `pilotoId` que le llegó.
//
// Deploy: supabase functions deploy subir-foto-piloto
import { createClient } from "npm:@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// El cliente ya recorta y comprime la imagen a un JPEG chico antes de
// mandarla (ver web/src/lib/fotoPiloto.js) -- este límite es solo una
// red de seguridad contra un cliente distinto o un bug del recorte.
const MAX_BYTES = 3 * 1024 * 1024;

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

    const { data: piloto } = await sb
      .from("pilotos")
      .select("id, piloto_roles ( rol_id )")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    // deno-lint-ignore no-explicit-any
    const roles = (piloto?.piloto_roles ?? []).map((r: any) => r.rol_id);
    const esAdmin = roles.includes("admin");

    const body = await req.json();
    const { pilotoId, contenidoBase64 } = body ?? {};
    if (!pilotoId || !contenidoBase64) return json({ error: "Faltan pilotoId o contenidoBase64" }, 400, cors);

    // Autorización: el propio piloto (su foto) o un admin (la de
    // cualquiera) -- cualquier otro caso queda bloqueado acá, no solo
    // ocultando el botón del lado del frontend.
    if (!esAdmin && piloto?.id !== pilotoId) {
      return json({ error: "No podés cambiar la foto de otro piloto" }, 403, cors);
    }

    const bytes = base64ToBytes(contenidoBase64);
    if (bytes.length > MAX_BYTES) return json({ error: "La imagen es demasiado grande" }, 400, cors);

    const path = `${pilotoId}.jpg`;
    const { error: errorSubida } = await sb.storage
      .from("fotos-pilotos")
      .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
    if (errorSubida) throw new Error(`fotos-pilotos storage.upload: ${errorSubida.message}`);

    const { data: publicUrl } = sb.storage.from("fotos-pilotos").getPublicUrl(path);
    // Cache-bust: el mismo path se pisa en cada cambio de foto, así que sin
    // esto el navegador podría seguir mostrando la versión vieja cacheada.
    const fotoUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;

    const { error: errorUpdate } = await sb.from("pilotos").update({ foto_url: fotoUrl }).eq("id", pilotoId);
    if (errorUpdate) throw new Error(`pilotos.update foto_url: ${errorUpdate.message}`);

    return json({ ok: true, fotoUrl }, 200, cors);
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
