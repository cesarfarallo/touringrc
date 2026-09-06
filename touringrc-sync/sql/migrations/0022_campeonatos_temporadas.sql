-- ============================================================
-- Migración 0022: campeonatos por temporada (multi-año)
--
-- `eventos.campeonato_id` ya existía desde el schema base (`schema.sql`),
-- pero nunca se usó desde la web: todas las fechas vivían en una sola
-- lista plana, sin noción de año/temporada. Esta migración:
--
--   1. Habilita RLS en `campeonatos` -- no tenía ninguna hasta ahora
--      (mismo gap que tenía `circuitos` antes de la migración 0009):
--      select público, insert/update/delete solo admin.
--   2. Crea la temporada "Metro Touring Eco 2026" si todavía no existe un
--      campeonato con ese nombre, con `fecha_inicio`/`fecha_fin`
--      calculados a partir del rango real de fechas de los eventos ya
--      cargados (si no hay ninguno, usa el año calendario actual como
--      placeholder).
--   3. Asocia a esa temporada todos los eventos que todavía no tuvieran
--      `campeonato_id` -- así el Calendario/Resultados no quedan vacíos
--      apenas se despliega el filtro por "temporada vigente".
-- ============================================================

alter table public.campeonatos enable row level security;

drop policy if exists "campeonatos lectura publica" on public.campeonatos;
create policy "campeonatos lectura publica" on public.campeonatos for select
  using (true);

drop policy if exists "admin escribe campeonatos" on public.campeonatos;
create policy "admin escribe campeonatos" on public.campeonatos for all
  using (public.es_admin())
  with check (public.es_admin());

do $$
declare
  v_campeonato_id uuid;
  v_desde date;
  v_hasta date;
begin
  select id into v_campeonato_id from public.campeonatos where nombre = 'Metro Touring Eco 2026';

  if v_campeonato_id is null then
    select min(fecha), max(fecha) into v_desde, v_hasta from public.eventos;
    if v_desde is null then
      v_desde := make_date(extract(year from now())::int, 1, 1);
      v_hasta := make_date(extract(year from now())::int, 12, 31);
    end if;

    insert into public.campeonatos (nombre, fecha_inicio, fecha_fin)
    values ('Metro Touring Eco 2026', v_desde, v_hasta)
    returning id into v_campeonato_id;
  end if;

  update public.eventos set campeonato_id = v_campeonato_id where campeonato_id is null;
end $$;
