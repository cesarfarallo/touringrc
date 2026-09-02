-- ============================================================
-- Migración 0007: ventana de inscripción configurable por evento
--
-- Reemplaza el criterio del booleano manual `inscripcion_habilitada`
-- (que el admin tenía que prender/apagar a mano) por una ventana
-- calculada: `inscripcion_dias_antes` es la cantidad de días antes de
-- `fecha` en que se habilita la inscripción online para ESA fecha en
-- particular (cada evento puede tener su propio valor). La web calcula
-- la ventana en el cliente (hoy >= fecha - inscripcion_dias_antes),
-- no hace falta un cron ni un campo de fecha calculada aparte.
--
-- No se borra `inscripcion_habilitada` (columna existente, sin uso de
-- acá en adelante) para no romper nada que la lea -- migración aditiva,
-- misma convención que el resto.
-- ============================================================

alter table public.eventos
  add column if not exists inscripcion_dias_antes int;
