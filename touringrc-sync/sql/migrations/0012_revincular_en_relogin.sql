-- ============================================================
-- Migración 0012: re-vincular también en cada login, no solo en el primero
--
-- Gap real encontrado en la práctica (probando el borrado de pilotos):
-- el trigger de la migración 0001 (`handle_new_user`, `AFTER INSERT ON
-- auth.users`) solo corre la primera vez que se crea la cuenta. Si el
-- piloto vinculado se borra después (por error, o a propósito) y esa
-- persona se vuelve a loguear, no pasa nada -- un re-login no inserta
-- una fila nueva en auth.users, solo la actualiza (Supabase Auth pisa
-- `last_sign_in_at` en cada login). Sin este trigger, la única forma
-- de arreglarlo era que un admin lo notara y lo resolviera a mano.
--
-- Se factoriza la lógica de matching de `handle_new_user()` (email ->
-- nombre+apellido -> crear nuevo + encolar en vinculos_pendientes) a
-- una función compartida, `vincular_piloto_para_login()`, usada tanto
-- por el trigger de INSERT (0001, redefinido acá para llamarla) como
-- por uno nuevo de UPDATE. La función arranca chequeando si ya hay un
-- piloto vinculado a esa cuenta -- así el trigger de UPDATE no hace
-- nada en el 99% de los logins (el caso normal, ya vinculado), solo
-- actúa cuando de verdad falta.
--
-- `vinculos_pendientes.auth_user_id` es unique, así que una cuenta que
-- ya pasó por la cola una vez (resuelta) no podía volver a encolarse
-- con un insert simple -- se cambia a upsert (`on conflict ... do
-- update`) para que un caso nuevo pise el registro viejo y vuelva a
-- aparecer como pendiente.
-- ============================================================

create or replace function public.vincular_piloto_para_login(p_auth_user_id uuid, p_email text, p_nombre text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piloto_id uuid;
  v_candidatos uuid[];
  v_first text;
  v_last text;
begin
  -- Ya hay un piloto vinculado a esta cuenta -- nada que hacer (el
  -- caso normal en cada login).
  if exists (select 1 from public.pilotos where auth_user_id = p_auth_user_id) then
    return;
  end if;

  -- 1. Match por email
  select id into v_piloto_id
  from public.pilotos
  where auth_user_id is null
    and email is not null
    and lower(email) = lower(p_email)
  limit 1;

  if v_piloto_id is not null then
    update public.pilotos set auth_user_id = p_auth_user_id, email = p_email, updated_at = now()
    where id = v_piloto_id;
    return;
  end if;

  -- 2. Match por nombre+apellido (solo si el login trae nombre)
  if p_nombre <> '' then
    v_first := split_part(p_nombre, ' ', 1);
    v_last := nullif(trim(substring(p_nombre from length(v_first) + 1)), '');

    if v_last is not null then
      select array_agg(id) into v_candidatos
      from public.pilotos
      where auth_user_id is null
        and lower(first_name) = lower(v_first)
        and lower(last_name) = lower(v_last);

      if array_length(v_candidatos, 1) = 1 then
        update public.pilotos set auth_user_id = p_auth_user_id, email = p_email, updated_at = now()
        where id = v_candidatos[1];
        return;
      end if;
    end if;
  end if;

  -- 3. Sin match único: crear un piloto nuevo (no bloquea el login) y
  -- encolarlo para que el admin lo confirme, corrija el nombre, o lo
  -- vincule con otro piloto ya cargado.
  insert into public.pilotos (first_name, last_name, email, auth_user_id)
  values (coalesce(nullif(v_first, ''), 'Piloto'), coalesce(v_last, ''), p_email, p_auth_user_id)
  returning id into v_piloto_id;

  insert into public.vinculos_pendientes (auth_user_id, email, nombre_login, piloto_creado_id, candidatos, resuelto, creado_at)
  values (p_auth_user_id, p_email, nullif(p_nombre, ''), v_piloto_id, v_candidatos, false, now())
  on conflict (auth_user_id) do update set
    email = excluded.email,
    nombre_login = excluded.nombre_login,
    piloto_creado_id = excluded.piloto_creado_id,
    candidatos = excluded.candidatos,
    resuelto = false,
    creado_at = now();
end;
$$;

-- Redefine el trigger de INSERT (0001/0002) para que llame a la función
-- compartida en vez de duplicar la lógica.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.vincular_piloto_para_login(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  );
  return new;
end;
$$;

-- Trigger nuevo: la misma lógica, pero en cada UPDATE de auth.users
-- (que es lo que dispara un re-login, no un INSERT).
create or replace function public.handle_user_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.vincular_piloto_para_login(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_login on auth.users;
create trigger on_auth_user_login
  after update on auth.users
  for each row execute function public.handle_user_login();
