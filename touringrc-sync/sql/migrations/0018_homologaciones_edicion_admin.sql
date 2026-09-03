-- ============================================================
-- Migración 0018: Oficina técnica -- edición de homologaciones
-- solo por admin, con flujo de aprobación para técnica
--
-- Hasta esta migración, la policy "tecnica gestiona homologaciones"
-- (0017) daba a técnica y admin permiso FOR ALL (insert/update/delete)
-- sobre homologaciones_neumaticos -- cualquiera con el módulo podía
-- editar o borrar directamente una homologación ya cargada. A partir
-- de acá: técnica sigue pudiendo cargar homologaciones nuevas
-- (Homologar / Cargar histórico) y verlas, pero corregir una marca ya
-- cargada requiere que un admin la edite directo, o que técnica
-- proponga el cambio y quede pendiente hasta que un admin lo apruebe
-- o lo rechace.
-- ============================================================

-- 1. Reemplaza la policy "for all" de homologaciones_neumaticos por
-- una por comando: select/insert siguen abiertos a técnica+admin,
-- update/delete quedan solo para admin.
drop policy if exists "tecnica gestiona homologaciones" on public.homologaciones_neumaticos;

drop policy if exists "homologaciones lectura tecnica" on public.homologaciones_neumaticos;
create policy "homologaciones lectura tecnica" on public.homologaciones_neumaticos for select
  using (public.tiene_modulo('homologacion'));

drop policy if exists "homologaciones carga tecnica" on public.homologaciones_neumaticos;
create policy "homologaciones carga tecnica" on public.homologaciones_neumaticos for insert
  with check (public.tiene_modulo('homologacion'));

drop policy if exists "homologaciones edicion admin" on public.homologaciones_neumaticos;
create policy "homologaciones edicion admin" on public.homologaciones_neumaticos for update
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists "homologaciones borrado admin" on public.homologaciones_neumaticos;
create policy "homologaciones borrado admin" on public.homologaciones_neumaticos for delete
  using (public.es_admin());

-- 2. Cola de correcciones de marca propuestas por técnica, a revisar
-- por un admin -- mismo patrón que `vinculos_pendientes`/`alias_pendientes`.
create table if not exists public.homologaciones_pendientes (
  id uuid primary key default gen_random_uuid(),
  homologacion_id uuid not null references public.homologaciones_neumaticos(id) on delete cascade,
  marca_id_nueva uuid not null references public.marcas_neumaticos(id) on delete restrict,
  propuesto_por text default (auth.jwt() ->> 'email'),
  creado_at timestamptz not null default now(),
  resuelto boolean not null default false,
  aprobado boolean
);

-- Evita dos correcciones propuestas a la vez para la misma homologación.
create unique index if not exists homologaciones_pendientes_una_activa
  on public.homologaciones_pendientes (homologacion_id)
  where not resuelto;

alter table public.homologaciones_pendientes enable row level security;

drop policy if exists "homologaciones pendientes lectura tecnica" on public.homologaciones_pendientes;
create policy "homologaciones pendientes lectura tecnica" on public.homologaciones_pendientes for select
  using (public.tiene_modulo('homologacion'));

drop policy if exists "homologaciones pendientes propuesta tecnica" on public.homologaciones_pendientes;
create policy "homologaciones pendientes propuesta tecnica" on public.homologaciones_pendientes for insert
  with check (public.tiene_modulo('homologacion'));

drop policy if exists "homologaciones pendientes resolucion admin" on public.homologaciones_pendientes;
create policy "homologaciones pendientes resolucion admin" on public.homologaciones_pendientes for update
  using (public.es_admin())
  with check (public.es_admin());
