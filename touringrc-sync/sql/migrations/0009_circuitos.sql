-- ============================================================
-- Migración 0009: circuitos, asociación a eventos y récords por categoría
--
-- Nuevo apartado "Circuitos": 7 pistas del club, cada una con un dibujo en
-- dos sentidos de recorrido (`web/public/circuitos-normales/Circuito{N}.png`
-- y `circuitos-invertidos/Circuito{N}.png`, ya presentes en el repo como
-- assets estáticos -- no se guardan en la base, se arman por convención a
-- partir de `numero`, mismo criterio que `logo.png`/`favicon.svg`).
--
-- `eventos.circuito_id`/`circuito_sentido`: para mostrar el dibujo del
-- circuito en la tarjeta de cada fecha del Calendario público.
--
-- `circuito_records`: récord vigente por circuito+categoría (no un
-- historial completo -- el admin lo pisa a mano cuando se bate). El nombre
-- del piloto va en texto libre (`piloto_nombre`), sin FK a `pilotos`: hay
-- récords viejos de pilotos que capaz nunca se loguearon a la web, y
-- cargarlos a mano como texto es más simple que forzar un match contra el
-- roster.
-- ============================================================

create table if not exists public.circuitos (
  id uuid primary key default gen_random_uuid(),
  numero int unique not null,
  nombre text not null,
  created_at timestamptz not null default now()
);

alter table public.circuitos enable row level security;

drop policy if exists "circuitos lectura publica" on public.circuitos;
create policy "circuitos lectura publica" on public.circuitos for select
  using (true);

drop policy if exists "admin escribe circuitos" on public.circuitos;
create policy "admin escribe circuitos" on public.circuitos for all
  using (public.es_admin())
  with check (public.es_admin());

insert into public.circuitos (numero, nombre)
values (1, 'Circuito 1'), (2, 'Circuito 2'), (3, 'Circuito 3'), (4, 'Circuito 4'),
       (5, 'Circuito 5'), (6, 'Circuito 6'), (7, 'Circuito 7')
on conflict (numero) do nothing;

alter table public.eventos
  add column if not exists circuito_id uuid references public.circuitos(id) on delete set null;
alter table public.eventos
  add column if not exists circuito_sentido text not null default 'normal'
    check (circuito_sentido in ('normal', 'invertido'));

create table if not exists public.circuito_records (
  id uuid primary key default gen_random_uuid(),
  circuito_id uuid not null references public.circuitos(id) on delete cascade,
  clase_id uuid not null references public.clases(id) on delete cascade,
  piloto_nombre text not null,
  tiempo text not null,
  fecha date,
  evento_id uuid references public.eventos(id) on delete set null,
  actualizado_at timestamptz not null default now(),
  unique (circuito_id, clase_id)
);

alter table public.circuito_records enable row level security;

drop policy if exists "records lectura publica" on public.circuito_records;
create policy "records lectura publica" on public.circuito_records for select
  using (true);

drop policy if exists "admin escribe records" on public.circuito_records;
create policy "admin escribe records" on public.circuito_records for all
  using (public.es_admin())
  with check (public.es_admin());
