-- ============================================================
-- Migración 0025: Oficina técnica lista pilotos solo de la temporada vigente
--
-- `neumaticos_estado_clase(p_clase_id)` (migración 0017) arma el listado
-- de pilotos "que alguna vez corrieron esa categoría" a partir de
-- `resultados_finales.clase_id`, sin mirar a qué evento/temporada
-- pertenece cada resultado. Tenía sentido cuando toda la base era una
-- sola temporada (antes de la migración 0022) -- dejó de tenerlo en
-- cuanto los eventos de años distintos (ej. Metro 2025 y Metro 2026)
-- empezaron a convivir con la misma `clases.nombre` (ver migración 0023):
-- la función mezclaba en una sola lista pilotos de todas las temporadas.
--
-- Se agrega `p_campeonato_id` a la función -- el frontend (OficinaTecnica.jsx)
-- le pasa el campeonato vigente (mismo criterio de siempre, fecha_inicio
-- más reciente, vía useCampeonato()) -- y se filtra por
-- `eventos.campeonato_id` en las tres partes de la consulta (última
-- homologación, roster de pilotos de la categoría, y conteo de eventos
-- desde la última homologación).
-- ============================================================

drop function if exists public.neumaticos_estado_clase(uuid);

create or replace function public.neumaticos_estado_clase(p_clase_id uuid, p_campeonato_id uuid)
returns table (
  piloto_id uuid,
  piloto_nombre text,
  ultima_homologacion_fecha date,
  ultima_homologacion_marca text,
  eventos_desde_ultima int,
  eventos_requeridos int,
  apto boolean
)
language sql
stable
as $$
  with ultima as (
    select distinct on (hn.piloto_id)
      hn.piloto_id,
      e.fecha as fecha_evento,
      mn.nombre as marca_nombre
    from public.homologaciones_neumaticos hn
    join public.eventos e on e.id = hn.evento_id
    join public.marcas_neumaticos mn on mn.id = hn.marca_id
    where hn.clase_id = p_clase_id
      and e.campeonato_id = p_campeonato_id
    order by hn.piloto_id, e.fecha desc, hn.creado_at desc
  ),
  pilotos_clase as (
    select distinct rf.piloto_id
    from public.resultados_finales rf
    join public.eventos e on e.id = rf.evento_id
    where rf.clase_id = p_clase_id
      and e.campeonato_id = p_campeonato_id
  )
  select
    p.id as piloto_id,
    trim(p.first_name || ' ' || p.last_name) as piloto_nombre,
    u.fecha_evento as ultima_homologacion_fecha,
    u.marca_nombre as ultima_homologacion_marca,
    coalesce(ed.cantidad, 0) as eventos_desde_ultima,
    c.homologacion_eventos_minimos as eventos_requeridos,
    (u.fecha_evento is null or coalesce(ed.cantidad, 0) >= c.homologacion_eventos_minimos) as apto
  from pilotos_clase pc
  join public.pilotos p on p.id = pc.piloto_id
  left join ultima u on u.piloto_id = p.id
  join public.clases c on c.id = p_clase_id
  left join lateral (
    select count(distinct rf2.evento_id) as cantidad
    from public.resultados_finales rf2
    join public.eventos e2 on e2.id = rf2.evento_id
    where rf2.piloto_id = p.id
      and rf2.clase_id = p_clase_id
      and e2.campeonato_id = p_campeonato_id
      and (u.fecha_evento is null or e2.fecha > u.fecha_evento)
  ) ed on true
  order by p.first_name, p.last_name;
$$;
