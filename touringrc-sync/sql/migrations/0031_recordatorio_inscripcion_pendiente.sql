-- ============================================================
-- Migración 0031: recordatorio de inscripción pendiente, cada 2 días
--
-- Pedido: además del aviso de "se abrió la inscripción" (migración 0026,
-- se manda una sola vez por evento), mandar un recordatorio periódico --
-- cada 2 días, mientras la ventana siga abierta -- a los pilotos opt-in
-- (`pilotos.acepta_notificaciones = true`) que TODAVÍA no se anotaron a
-- la fecha vigente.
--
-- `eventos.ultimo_recordatorio_inscripcion` (timestamptz, no boolean como
-- `notificacion_inscripcion_enviada`) porque este aviso se repite mientras
-- la ventana esté abierta, no es "una vez y listo" -- la Edge Function
-- `recordatorio-inscripcion` (nueva, `supabase/functions/recordatorio-inscripcion/`)
-- mira cuánto tiempo pasó desde este timestamp y no hace nada si todavía no
-- pasaron 2 días, mismo patrón que `frases_destacadas.generado_en`
-- (migración 0027) para el "cada 3 días" de esa función -- un cron de
-- afuera simplemente diario, con el intervalo real resuelto adentro.
-- ============================================================

alter table public.eventos
  add column if not exists ultimo_recordatorio_inscripcion timestamptz;
