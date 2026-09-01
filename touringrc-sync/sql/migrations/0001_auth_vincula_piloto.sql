-- ============================================================
-- Migración 0001: vincular pilotos con el login (Google/Apple)
--
-- Qué hace: cuando alguien se loguea por primera vez (Supabase Auth
-- crea una fila en auth.users), este trigger corre server-side
-- (security definer, no depende de RLS) y:
--   1. Si ya existe un piloto con ese email y sin auth_user_id
--      todavía (ej. alguien que ya corrió en pista y su email quedó
--      cargado en `pilotos` por otra vía), lo vincula.
--   2. Si no, crea un piloto nuevo con ese email y auth_user_id.
--
-- Por qué server-side y no RLS + insert/update desde el cliente: así
-- evitamos tener que abrir policies de insert/update en `pilotos`
-- que un usuario logueado podría usar para "pisar" un piloto ajeno
-- adivinando o forzando el matching por email. El trigger corre con
-- privilegios elevados y hace exactamente esa lógica, nada más.
--
-- Nota: hoy `sync_pilotos` (touringrc-sync/sync_evento.py) no lee la
-- columna Email de GenericImport.csv, así que el caso (1) todavía no
-- va a matchear casi nunca en la práctica -- casi todos los logins
-- van a crear un piloto nuevo. Se puede sumar más adelante sin tocar
-- este trigger.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piloto_id uuid;
  v_nombre text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '');
  v_first text;
  v_last text;
begin
  select id into v_piloto_id
  from public.pilotos
  where auth_user_id is null
    and email is not null
    and lower(email) = lower(new.email)
  limit 1;

  if v_piloto_id is not null then
    update public.pilotos
    set auth_user_id = new.id,
        email = new.email,
        updated_at = now()
    where id = v_piloto_id;
  else
    v_first := nullif(split_part(v_nombre, ' ', 1), '');
    v_last := nullif(trim(substring(v_nombre from length(split_part(v_nombre, ' ', 1)) + 1)), '');

    insert into public.pilotos (first_name, last_name, email, auth_user_id)
    values (coalesce(v_first, 'Piloto'), coalesce(v_last, ''), new.email, new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
