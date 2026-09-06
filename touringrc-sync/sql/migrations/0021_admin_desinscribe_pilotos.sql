-- ============================================================
-- Migración 0021: admin puede desinscribir a un piloto
--
-- `inscripciones` nunca tuvo policy de delete para nadie -- ni el
-- propio piloto podía cancelar su inscripción, ni un admin podía
-- sacarla a mano. Hacía falta para el botón "Quitar" que suma
-- GestionEventos.jsx al lado de "Inscribir piloto" (migración 0015).
-- ============================================================

drop policy if exists "admin desinscribe a cualquier piloto" on public.inscripciones;
create policy "admin desinscribe a cualquier piloto" on public.inscripciones for delete
  using (public.es_admin());
