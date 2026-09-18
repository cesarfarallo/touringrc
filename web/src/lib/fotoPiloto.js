import { supabase } from "./supabase";
import { archivoABase64, extraerMensajeError } from "./edgeFunction";

// Recorta la imagen elegida a un cuadrado centrado y la reduce a un JPEG
// chico -- mismo criterio de recorte centrado que usa `FotoPiloto.jsx`
// para mostrarla (object-fit: cover en un círculo), hecho ACÁ antes de
// subir para no depender de que la foto original ya venga cuadrada (una
// foto panorámica con la persona chica en el cuadro corta mal la cara si
// se recorta a ciegas del lado del navegador que la muestra) y para no
// mandar archivos pesados (una foto de celular sin comprimir) a la Edge
// Function. No es un recorte manual -- el piloto no puede reposicionar la
// cara antes de subir, queda pendiente si hace falta más adelante.
async function recortarACuadrado(file, lado = 480) {
  const bitmap = await createImageBitmap(file);
  const corto = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - corto) / 2;
  const sy = (bitmap.height - corto) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, sx, sy, corto, corto, 0, 0, lado, lado);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo procesar la imagen"))), "image/jpeg", 0.85);
  });
}

// Sube la foto de `pilotoId` vía la Edge Function `subir-foto-piloto` --
// la función decide si quien está logueado puede subir justo esa foto
// (dueño del piloto, o admin); este helper solo prepara el archivo y
// dispara la subida. Devuelve la URL pública nueva.
export async function subirFotoPiloto(pilotoId, file) {
  const blob = await recortarACuadrado(file);
  const contenidoBase64 = await archivoABase64(blob);
  const { data, error } = await supabase.functions.invoke("subir-foto-piloto", {
    body: { pilotoId, contenidoBase64 },
  });
  if (error) throw new Error(await extraerMensajeError(error));
  if (data?.error) throw new Error(data.error);
  return data.fotoUrl;
}
