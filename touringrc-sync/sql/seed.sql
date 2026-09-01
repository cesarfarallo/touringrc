-- ============================================================
-- Seed: Torneo Metro Touring Eco + las fechas ya corridas
-- Correr DESPUÉS de schema.sql, también en el SQL Editor de Supabase
-- ============================================================

-- Todo en una sola consulta: crea el campeonato y le encadena las 7 fechas
-- automáticamente (sin necesidad de copiar/pegar ningún id a mano).
with nuevo_campeonato as (
  insert into campeonatos (nombre, fecha_inicio, fecha_fin)
  values ('Torneo Metro Touring Eco', '2026-03-14', '2026-12-31')
  returning id
)
insert into eventos (campeonato_id, nombre, fecha, corrida)
select id, 'Fecha 1 Metro', '2026-03-14'::date, true from nuevo_campeonato
union all
select id, 'Fecha 2 Metro', '2026-04-18'::date, true from nuevo_campeonato
union all
select id, 'Fecha 3 Metro', '2026-05-02'::date, true from nuevo_campeonato
union all
select id, 'Fecha 4 Metro', '2026-05-16'::date, true from nuevo_campeonato
union all
select id, 'Fecha 5 Metro', '2026-06-06'::date, true from nuevo_campeonato
union all
select id, 'Fecha 6 Metro', '2026-07-18'::date, true from nuevo_campeonato
union all
select id, 'Fecha 7 Metro', '2026-08-08'::date, true from nuevo_campeonato
returning id, nombre, fecha; -- estos son los evento_id que vas a usar en --evento-id

-- Si después necesitás el campeonato_id (por ejemplo para sincronizar el
-- SeriesResultReport con --campeonato-id), corré esto aparte:
-- select id from campeonatos where nombre = 'Torneo Metro Touring Eco';
