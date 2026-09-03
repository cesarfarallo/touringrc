-- ============================================================
-- Migración 0016: lectura pública de inscripciones
--
-- Para el botón "Ver inscriptos" (popup público en la tarjeta destacada
-- del Calendario, visible sin necesidad de estar logueado ni ser
-- admin) -- hasta ahora `inscripciones` solo se podía leer si era la
-- propia (autoservicio) o si se era admin (migración 0015). Es
-- información que ya es pública en la práctica (quién corre en la
-- próxima fecha), así que se abre lectura pública directa, mismo
-- criterio que `eventos`/`pilotos`/`clases`.
-- ============================================================

drop policy if exists "lectura publica de inscripciones" on public.inscripciones;
create policy "lectura publica de inscripciones" on public.inscripciones for select
  using (true);
