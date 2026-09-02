-- ============================================================
-- Migración 0004: admin puede crear/editar eventos desde la web
--
-- `eventos` solo tenía policy de SELECT (lectura pública) -- hacía
-- falta para el nuevo módulo "Gestión de Eventos" del panel admin
-- (alta de fechas del calendario, y más adelante marcar
-- inscripcion_habilitada/corrida/archivos al subir resultados).
-- ============================================================

drop policy if exists "admin inserta eventos" on public.eventos;
create policy "admin inserta eventos" on public.eventos for insert
  with check (public.es_admin());

drop policy if exists "admin actualiza eventos" on public.eventos;
create policy "admin actualiza eventos" on public.eventos for update
  using (public.es_admin())
  with check (public.es_admin());
