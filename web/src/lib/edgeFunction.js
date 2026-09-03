// Helpers compartidos por cualquier botón admin que suba un archivo a la
// Edge Function subir-resultado (Gestión de eventos, Circuitos).

export function archivoABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// supabase-js resume cualquier error HTTP de una Edge Function como
// "Edge Function returned a non-2xx status code", sin exponer el body
// real que devolvimos (`{ error: "..." }`) -- hay que ir a buscarlo a
// `error.context` (la Response cruda) para mostrar el motivo real.
export async function extraerMensajeError(error) {
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.clone().json();
      if (body?.error) return body.error;
    } catch {
      // el body no era JSON -- nos quedamos con error.message
    }
  }
  return error.message ?? String(error);
}
