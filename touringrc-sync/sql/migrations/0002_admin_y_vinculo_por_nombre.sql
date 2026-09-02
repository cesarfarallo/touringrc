-- ============================================================
-- Migración 0002: admin real + vinculación de login por nombre
--
-- Reemplaza el "toggle ADMIN" del frontend (que hoy es puramente
-- visual, cualquier logueado lo puede prender) por una lista real de
-- emails autorizados, validada del lado del servidor vía RLS. Y
-- extiende el trigger de vinculación de la migración 0001 para
-- matchear también por nombre+apellido (no solo por email), porque
-- el roster ya cargado en Live Timing no trae email -- ver
-- touringrc-sync/files/EventVerification-Event30.xls.
--
-- ⚠️ ANTES DE CORRER: reemplazá 'TU_EMAIL_AQUI@gmail.com' más abajo
-- por tu email real de Google (el que usás para loguearte en la web).
-- ============================================================

-- ---------------------------------------------------------------
-- 1. Tabla de admins + función helper para RLS
-- ---------------------------------------------------------------
create table if not exists public.admins (
  email text primary key,
  creado_at timestamptz default now()
);

alter table public.admins enable row level security;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where email = auth.jwt() ->> 'email'
  );
$$;

drop policy if exists "un admin ve la lista de admins" on public.admins;
create policy "un admin ve la lista de admins" on public.admins for select
  using (public.es_admin());

-- Un admin puede corregir la vinculación (auth_user_id) o el nombre de
-- cualquier piloto -- necesario para el panel de revisión.
drop policy if exists "admin corrige pilotos" on public.pilotos;
create policy "admin corrige pilotos" on public.pilotos for update
  using (public.es_admin())
  with check (public.es_admin());

insert into public.admins (email) values ('TU_EMAIL_AQUI@gmail.com')
on conflict (email) do nothing;

-- ---------------------------------------------------------------
-- 2. Cola de revisión: logins que NO matchearon 1 a 1 contra el
-- roster ya cargado (0 candidatos -> se creó un piloto nuevo; 2+
-- candidatos -> ambiguo). El admin decide si está bien o si hay que
-- fusionarlo con un piloto ya existente.
-- ---------------------------------------------------------------
create table if not exists public.vinculos_pendientes (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id),
  email text,
  nombre_login text,
  piloto_creado_id uuid references public.pilotos(id),
  candidatos uuid[],
  resuelto boolean default false,
  creado_at timestamptz default now()
);

alter table public.vinculos_pendientes enable row level security;

drop policy if exists "admin ve vinculos pendientes" on public.vinculos_pendientes;
create policy "admin ve vinculos pendientes" on public.vinculos_pendientes for select
  using (public.es_admin());

drop policy if exists "admin resuelve vinculos pendientes" on public.vinculos_pendientes;
create policy "admin resuelve vinculos pendientes" on public.vinculos_pendientes for update
  using (public.es_admin())
  with check (public.es_admin());

-- ---------------------------------------------------------------
-- 3. Trigger de vinculación (reemplaza el de 0001): ahora intenta
-- por email primero (por si algún piloto sí lo tiene) y si no,
-- por nombre+apellido exacto contra pilotos sin vincular.
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piloto_id uuid;
  v_candidatos uuid[];
  v_nombre text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '');
  v_first text;
  v_last text;
begin
  -- 1. Match por email (por si el piloto ya lo tenía cargado)
  select id into v_piloto_id
  from public.pilotos
  where auth_user_id is null
    and email is not null
    and lower(email) = lower(new.email)
  limit 1;

  if v_piloto_id is not null then
    update public.pilotos set auth_user_id = new.id, email = new.email, updated_at = now()
    where id = v_piloto_id;
    return new;
  end if;

  -- 2. Match por nombre+apellido (solo si el login trajo un nombre,
  -- ej. Google -- el magic link a email no trae nombre)
  if v_nombre <> '' then
    v_first := split_part(v_nombre, ' ', 1);
    v_last := nullif(trim(substring(v_nombre from length(v_first) + 1)), '');

    if v_last is not null then
      select array_agg(id) into v_candidatos
      from public.pilotos
      where auth_user_id is null
        and lower(first_name) = lower(v_first)
        and lower(last_name) = lower(v_last);

      if array_length(v_candidatos, 1) = 1 then
        update public.pilotos set auth_user_id = new.id, email = new.email, updated_at = now()
        where id = v_candidatos[1];
        return new;
      end if;
    end if;
  end if;

  -- 3. Sin match único: crear un piloto nuevo (no bloquea el login)
  -- y encolarlo para que el admin confirme o lo fusione a mano.
  insert into public.pilotos (first_name, last_name, email, auth_user_id)
  values (coalesce(nullif(v_first, ''), 'Piloto'), coalesce(v_last, ''), new.email, new.id)
  returning id into v_piloto_id;

  insert into public.vinculos_pendientes (auth_user_id, email, nombre_login, piloto_creado_id, candidatos)
  values (new.id, new.email, nullif(v_nombre, ''), v_piloto_id, v_candidatos)
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

-- El trigger on_auth_user_created de la migración 0001 ya apunta a esta
-- función por nombre, no hace falta recrearlo.

-- ---------------------------------------------------------------
-- 4. Función para que el admin fusione un piloto duplicado (el que
-- se creó automáticamente) con el piloto correcto ya existente: pasa
-- el auth_user_id al piloto correcto, reasigna todo el historial, y
-- borra el duplicado. Todo en una transacción.
-- ---------------------------------------------------------------
create or replace function public.fusionar_pilotos(p_duplicado_id uuid, p_correcto_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid;
  v_email text;
begin
  if not public.es_admin() then
    raise exception 'Solo un admin puede fusionar pilotos';
  end if;
  if p_duplicado_id = p_correcto_id then
    raise exception 'No se puede fusionar un piloto consigo mismo';
  end if;

  select auth_user_id, email into v_auth_user_id, v_email from public.pilotos where id = p_duplicado_id;

  update public.resultados_finales set piloto_id = p_correcto_id where piloto_id = p_duplicado_id;
  update public.resultados_ronda set piloto_id = p_correcto_id where piloto_id = p_duplicado_id;
  update public.campeonato_puntos set piloto_id = p_correcto_id where piloto_id = p_duplicado_id;
  update public.inscripciones set piloto_id = p_correcto_id where piloto_id = p_duplicado_id;
  update public.piloto_alias set piloto_id = p_correcto_id where piloto_id = p_duplicado_id;

  update public.pilotos
  set auth_user_id = v_auth_user_id, email = coalesce(email, v_email), updated_at = now()
  where id = p_correcto_id;

  update public.vinculos_pendientes set resuelto = true where piloto_creado_id = p_duplicado_id;

  delete from public.pilotos where id = p_duplicado_id;
end;
$$;
