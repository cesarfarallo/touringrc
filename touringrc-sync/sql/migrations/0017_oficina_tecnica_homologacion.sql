-- ============================================================
-- Migración 0017: Oficina técnica -- homologación de neumáticos
--
-- Nuevo módulo `homologacion` (sistema de roles/módulos de la 0003),
-- otorgado a `admin` y `tecnica` -- son los únicos que pueden ver y
-- usar esta sección, tanto en el frontend como a nivel RLS (no alcanza
-- con ocultar el tab).
--
-- Regla de negocio: cada categoría permite homologar un juego de
-- neumáticos nuevo cada N eventos (N = `clases.homologacion_eventos_minimos`,
-- en vez de hardcodear nombres de categoría en el código -- así se
-- puede ajustar sin tocar código si el club cambia el reglamento).
-- Modified: 1 (uno nuevo por cada evento). Stock: 2 (tiene que haberse
-- presentado a mínimo 2 eventos desde la última homologación). El
-- default de la columna es 1 -- cualquier categoría nueva permite
-- homologar en cada evento salvo que se configure lo contrario.
--
-- "Presentarse a un evento" se mide por tener una fila en
-- `resultados_finales` para esa categoría en ese evento (corrió de
-- verdad), no por estar inscripto (eso es solo intención de asistir).
-- ============================================================

-- 1. Módulo + acceso
insert into public.modulos (id, nombre, descripcion) values
  ('homologacion', 'Oficina técnica', 'Homologación de neumáticos por piloto y categoría')
on conflict (id) do nothing;

insert into public.rol_modulos (rol_id, modulo_id) values
  ('admin', 'homologacion'),
  ('tecnica', 'homologacion')
on conflict do nothing;

-- 2. Cuántos eventos mínimo entre homologaciones, por categoría
alter table public.clases
  add column if not exists homologacion_eventos_minimos int not null default 1;

update public.clases set homologacion_eventos_minimos = 2 where nombre = 'Touring Eco Stock';

-- `clases` no tenía RLS habilitado (punto ciego pendiente de Fase F) --
-- se habilita acá porque hace falta una policy de update real para que
-- técnica pueda ajustar `homologacion_eventos_minimos` desde la web.
alter table public.clases enable row level security;

drop policy if exists "clases lectura publica" on public.clases;
create policy "clases lectura publica" on public.clases for select
  using (true);

drop policy if exists "tecnica edita clases" on public.clases;
create policy "tecnica edita clases" on public.clases for update
  using (public.tiene_modulo('homologacion'))
  with check (public.tiene_modulo('homologacion'));

-- 3. Marcas de neumáticos (logo opcional -- se completa con una URL,
-- no hay upload de imágenes en esta app todavía)
create table if not exists public.marcas_neumaticos (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null,
  logo_url text,
  creado_at timestamptz not null default now()
);

alter table public.marcas_neumaticos enable row level security;

drop policy if exists "tecnica gestiona marcas" on public.marcas_neumaticos;
create policy "tecnica gestiona marcas" on public.marcas_neumaticos for all
  using (public.tiene_modulo('homologacion'))
  with check (public.tiene_modulo('homologacion'));

-- 4. Homologaciones: un juego de neumáticos de una marca, para un
-- piloto, en una categoría, en un evento puntual.
create table if not exists public.homologaciones_neumaticos (
  id uuid primary key default gen_random_uuid(),
  piloto_id uuid not null references public.pilotos(id) on delete cascade,
  clase_id uuid not null references public.clases(id) on delete cascade,
  marca_id uuid not null references public.marcas_neumaticos(id) on delete restrict,
  evento_id uuid not null references public.eventos(id) on delete cascade,
  creado_at timestamptz not null default now(),
  unique (piloto_id, clase_id, evento_id)
);

alter table public.homologaciones_neumaticos enable row level security;

drop policy if exists "tecnica gestiona homologaciones" on public.homologaciones_neumaticos;
create policy "tecnica gestiona homologaciones" on public.homologaciones_neumaticos for all
  using (public.tiene_modulo('homologacion'))
  with check (public.tiene_modulo('homologacion'));

-- 5. Estado de homologación por piloto, para una categoría: última
-- homologación (fecha + marca), cuántos eventos pasaron desde
-- entonces (contando solo eventos donde el piloto corrió de verdad
-- esa categoría), y si está apto para homologar un juego nuevo. Solo
-- lista pilotos que alguna vez corrieron esa categoría (resultados_finales).
-- `language sql` (no `security definer`): corre con los permisos de
-- quien llama, así que RLS de homologaciones_neumaticos/marcas_neumaticos
-- ya lo protege solo -- no hace falta re-chequear el rol acá.
create or replace function public.neumaticos_estado_clase(p_clase_id uuid)
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
    order by hn.piloto_id, e.fecha desc, hn.creado_at desc
  ),
  pilotos_clase as (
    select distinct rf.piloto_id
    from public.resultados_finales rf
    where rf.clase_id = p_clase_id
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
      and (u.fecha_evento is null or e2.fecha > u.fecha_evento)
  ) ed on true
  order by p.first_name, p.last_name;
$$;
