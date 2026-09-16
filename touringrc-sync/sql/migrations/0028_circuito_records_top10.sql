-- ============================================================
-- Migración 0028: top 10 de récords por circuito+categoría+sentido
--
-- `circuito_records` guarda solo el récord vigente (posición 1) por
-- circuito+categoría+sentido -- el propio archivo `RaceResultRecords*.xls`
-- que ya se sube desde "Importar records" trae varias filas debajo de
-- cada título de categoría (no solo la primera), pero el parser las
-- ignoraba a propósito. Esta migración agrega una tabla nueva para
-- guardar esas filas siguientes también, sin tocar el contrato de
-- `circuito_records` (sigue siendo "el vigente", 1 fila por combinación).
-- ============================================================

create table if not exists public.circuito_records_top10 (
  id uuid primary key default gen_random_uuid(),
  circuito_id uuid not null references public.circuitos(id) on delete cascade,
  clase_id uuid not null references public.clases(id) on delete cascade,
  sentido text not null default 'normal'
    check (sentido in ('normal', 'invertido')),
  posicion int not null check (posicion >= 1),
  piloto_nombre text not null,
  tiempo text not null,
  fecha date,
  actualizado_at timestamptz not null default now(),
  unique (circuito_id, clase_id, sentido, posicion)
);

alter table public.circuito_records_top10 enable row level security;

drop policy if exists "top10 lectura publica" on public.circuito_records_top10;
create policy "top10 lectura publica" on public.circuito_records_top10 for select
  using (true);

drop policy if exists "admin escribe top10" on public.circuito_records_top10;
create policy "admin escribe top10" on public.circuito_records_top10 for all
  using (public.es_admin())
  with check (public.es_admin());
