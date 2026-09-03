-- ============================================================
-- Migración 0015: admin ve todas las inscripciones e inscribe a mano
--
-- Bug encontrado al armar el botón de compartir inscriptos por redes:
-- `inscripciones` solo tenía la policy de select "cada uno ve las
-- suyas" (ownership por auth_user_id) -- ningún admin podía leer las
-- inscripciones de otro piloto. Esto ya afectaba en silencio al botón
-- "Exportar inscriptos" existente en Gestión de eventos: hasta ahora
-- devolvía solo la inscripción propia del admin (si tenía alguna), no
-- la lista completa del evento.
--
-- Se agregan dos policies nuevas (las viejas quedan igual -- Postgres
-- combina policies permisivas del mismo comando con OR, así que el
-- autoservicio de cada piloto sigue funcionando sin tocarlo):
-- 1. Select para admin: todas las inscripciones de cualquier evento.
-- 2. Insert para admin: inscribir a cualquier piloto a mano, sin el
--    chequeo de tiene_modulo('inscripcion') que aplica al autoservicio
--    -- que el admin lo elija de la lista de pilotos ya es la
--    aprobación en sí.
-- ============================================================

drop policy if exists "admin ve todas las inscripciones" on public.inscripciones;
create policy "admin ve todas las inscripciones" on public.inscripciones for select
  using (public.es_admin());

drop policy if exists "admin inscribe a cualquier piloto" on public.inscripciones;
create policy "admin inscribe a cualquier piloto" on public.inscripciones for insert
  with check (public.es_admin());
