import { supabase } from "./supabase";
import { archivoABase64, extraerMensajeError } from "./edgeFunction";

// Sube la foto de `pilotoId` vía la Edge Function `subir-foto-piloto` --
// la función decide si quien está logueado puede subir justo esa foto
// (dueño del piloto, o admin); este helper solo dispara la subida. `blob`
// ya viene recortado a cuadrado por `RecortarFoto.jsx` (editor manual de
// posición/zoom, reemplaza el recorte automático centrado que tenía antes
// esta misma función) -- no se vuelve a procesar la imagen acá. Devuelve
// la URL pública nueva.
export async function subirFotoPiloto(pilotoId, blob) {
  const contenidoBase64 = await archivoABase64(blob);
  const { data, error } = await supabase.functions.invoke("subir-foto-piloto", {
    body: { pilotoId, contenidoBase64 },
  });
  if (error) throw new Error(await extraerMensajeError(error));
  if (data?.error) throw new Error(data.error);
  return data.fotoUrl;
}
