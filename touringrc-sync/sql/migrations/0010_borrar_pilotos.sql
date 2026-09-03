-- ============================================================
-- Migración 0010: admin puede borrar pilotos + fix de fusionar_pilotos()
--
-- Nueva policy de delete en `pilotos` -- solo existían insert (0005) y
-- update (0002), nunca delete. Hace falta para el botón "Borrar" del
-- panel Pilotos y para el nuevo flujo de VinculosPendientes.jsx (elegir
-- cualquier piloto ya cargado, no solo los candidatos automáticos, y
-- fusionar el duplicado hacia él).
--
-- Bug encontrado al revisar `fusionar_pilotos()` (migración 0002) para
-- este cambio: borra el piloto duplicado al final, pero
-- `vinculos_pendientes.piloto_creado_id` seguía apuntándolo SIN
-- "on delete set null" -- ese delete iba a violar la FK apenas la fila
-- de vinculos_pendientes que originó el duplicado (que siempre existe,
-- es como se detecta el caso) quedara sin resolver apuntándole. Se
-- corrige acá antes de que el nuevo botón de búsqueda libre lo dispare
-- en la práctica.
-- ============================================================

alter table public.vinculos_pendientes
  drop constraint if exists vinculos_pendientes_piloto_creado_id_fkey;
alter table public.vinculos_pendientes
  add constraint vinculos_pendientes_piloto_creado_id_fkey
  foreign key (piloto_creado_id) references public.pilotos(id) on delete set null;

drop policy if exists "admin borra pilotos" on public.pilotos;
create policy "admin borra pilotos" on public.pilotos for delete
  using (public.es_admin());
