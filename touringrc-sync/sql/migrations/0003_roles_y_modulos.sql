-- ============================================================
-- Migración 0003: roles configurables por módulo
--
-- En vez de codificar a mano qué puede hacer cada rol (Técnica,
-- Comisario deportivo, Cronometrista, ...), se arma un esquema
-- genérico: la app se divide en "módulos" (pantallas/funciones), y
-- para cada rol el admin tilda a qué módulos tiene acceso. Un piloto
-- puede tener uno o más roles.
--
-- Reemplaza el mecanismo de la migración 0002 (tabla `admins` +
-- es_admin() por email) por algo más general: el rol 'admin' pasa a
-- ser un rol más dentro de este sistema, con acceso a todos los
-- módulos por default. `es_admin()` se redefine para no romper las
-- policies que ya la usan (pilotos, vinculos_pendientes, etc.) — la
-- tabla `admins` queda sin usar pero no se borra, por las dudas.
-- ============================================================

-- ---------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------
create table if not exists public.roles (
  id text primary key,
  nombre text not null
);

create table if not exists public.modulos (
  id text primary key,
  nombre text not null,
  descripcion text
);

create table if not exists public.rol_modulos (
  rol_id text not null references public.roles(id) on delete cascade,
  modulo_id text not null references public.modulos(id) on delete cascade,
  primary key (rol_id, modulo_id)
);

create table if not exists public.piloto_roles (
  piloto_id uuid not null references public.pilotos(id) on delete cascade,
  rol_id text not null references public.roles(id) on delete cascade,
  primary key (piloto_id, rol_id)
);

-- ---------------------------------------------------------------
-- 2. Seed: roles y módulos iniciales
-- ---------------------------------------------------------------
insert into public.roles (id, nombre) values
  ('admin', 'Admin'),
  ('piloto', 'Piloto'),
  ('tecnica', 'Técnica'),
  ('comisario', 'Comisario deportivo'),
  ('cronometrista', 'Cronometrista')
on conflict (id) do nothing;

insert into public.modulos (id, nombre, descripcion) values
  ('calendario', 'Calendario', 'Ver el calendario de fechas'),
  ('resultados', 'Resultados', 'Ver resultados de cada fecha'),
  ('campeonato', 'Campeonato', 'Ver la tabla acumulada del campeonato'),
  ('inscripcion', 'Inscripción', 'Inscribirse a una fecha'),
  ('admin_pilotos', 'Admin: pilotos', 'Auditar/corregir pilotos y vínculos de login'),
  ('admin_calendario', 'Admin: calendario', 'Crear y editar fechas del campeonato'),
  ('admin_resultados', 'Admin: resultados', 'Subir los archivos de resultados de un evento'),
  ('admin_roles', 'Admin: roles y usuarios', 'Asignar roles a pilotos y configurar qué ve cada rol')
on conflict (id) do nothing;

-- Admin: todos los módulos. Piloto: los públicos (ejemplo pedido).
-- Técnica/Comisario/Cronometrista arrancan sin módulos asignados —
-- se configuran desde el panel "Admin: roles y usuarios".
insert into public.rol_modulos (rol_id, modulo_id)
select 'admin', id from public.modulos
on conflict do nothing;

insert into public.rol_modulos (rol_id, modulo_id) values
  ('piloto', 'calendario'),
  ('piloto', 'resultados'),
  ('piloto', 'campeonato'),
  ('piloto', 'inscripcion')
on conflict do nothing;

-- Migrar los admins existentes (tabla `admins` de la migración 0002)
-- al nuevo esquema, si ya tienen un piloto vinculado con ese email.
insert into public.piloto_roles (piloto_id, rol_id)
select p.id, 'admin'
from public.pilotos p
join public.admins a on lower(a.email) = lower(p.email)
on conflict do nothing;

-- ---------------------------------------------------------------
-- 3. Funciones helper (security definer, para usar en RLS y desde
-- el frontend vía supabase.rpc(...))
-- ---------------------------------------------------------------

-- ¿El usuario logueado tiene acceso a este módulo? (por cualquiera
-- de sus roles)
create or replace function public.tiene_modulo(p_modulo_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pilotos p
    join public.piloto_roles pr on pr.piloto_id = p.id
    join public.rol_modulos rm on rm.rol_id = pr.rol_id
    where p.auth_user_id = auth.uid()
      and rm.modulo_id = p_modulo_id
  );
$$;

-- Todos los módulos a los que tiene acceso el usuario logueado (para
-- armar el menú/gating del lado del frontend en una sola consulta).
create or replace function public.mis_modulos()
returns table (modulo_id text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct rm.modulo_id
  from public.pilotos p
  join public.piloto_roles pr on pr.piloto_id = p.id
  join public.rol_modulos rm on rm.rol_id = pr.rol_id
  where p.auth_user_id = auth.uid();
$$;

-- Redefinida en términos del nuevo esquema de roles (antes miraba la
-- tabla `admins`). Las policies que ya la usan (pilotos,
-- vinculos_pendientes) siguen funcionando sin cambios.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pilotos p
    join public.piloto_roles pr on pr.piloto_id = p.id
    where p.auth_user_id = auth.uid() and pr.rol_id = 'admin'
  );
$$;

-- ---------------------------------------------------------------
-- 4. RLS: roles/módulos son de lectura pública (hace falta poder
-- consultarlos para armar el menú), solo un admin los edita.
-- ---------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.modulos enable row level security;
alter table public.rol_modulos enable row level security;
alter table public.piloto_roles enable row level security;

drop policy if exists "lectura publica roles" on public.roles;
create policy "lectura publica roles" on public.roles for select using (true);

drop policy if exists "lectura publica modulos" on public.modulos;
create policy "lectura publica modulos" on public.modulos for select using (true);

drop policy if exists "lectura publica rol_modulos" on public.rol_modulos;
create policy "lectura publica rol_modulos" on public.rol_modulos for select using (true);

drop policy if exists "admin inserta rol_modulos" on public.rol_modulos;
create policy "admin inserta rol_modulos" on public.rol_modulos for insert
  with check (public.es_admin());
drop policy if exists "admin borra rol_modulos" on public.rol_modulos;
create policy "admin borra rol_modulos" on public.rol_modulos for delete
  using (public.es_admin());

-- piloto_roles: cada piloto puede ver sus propios roles; un admin ve
-- y edita los de todos.
drop policy if exists "piloto ve sus roles" on public.piloto_roles;
create policy "piloto ve sus roles" on public.piloto_roles for select
  using (
    public.es_admin()
    or piloto_id in (select id from public.pilotos where auth_user_id = auth.uid())
  );
drop policy if exists "admin inserta piloto_roles" on public.piloto_roles;
create policy "admin inserta piloto_roles" on public.piloto_roles for insert
  with check (public.es_admin());
drop policy if exists "admin borra piloto_roles" on public.piloto_roles;
create policy "admin borra piloto_roles" on public.piloto_roles for delete
  using (public.es_admin());
