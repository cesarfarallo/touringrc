-- ============================================================
-- Migración 0011: admin puede re-vincular un piloto a una cuenta ya
-- logueada, a mano, desde la web (sin SQL Editor)
--
-- Gap real encontrado en la práctica: si un piloto vinculado se borra
-- por error (o se desvincula de cualquier otra forma), no hay manera
-- de recuperarlo solo con la web -- el trigger de la migración 0001
-- corre UNA sola vez, al crearse la fila en auth.users (primer login),
-- no en cada login. Cargarle de nuevo el mismo email al piloto (ya
-- posible desde antes, EmailEditable) NO alcanza: nada vuelve a correr
-- el matching. La documentación anterior en CLAUDE.md decía lo
-- contrario -- estaba mal, corregido junto con esta migración.
--
-- `vincular_piloto_por_email()` busca la cuenta en auth.users (una
-- tabla que el cliente nunca puede leer directo, ni siquiera un admin
-- vía RLS) y pisa `pilotos.auth_user_id` -- mismo patrón security
-- definer que `fusionar_pilotos()` (migración 0002).
-- ============================================================

create or replace function public.vincular_piloto_por_email(p_piloto_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un admin puede vincular pilotos';
  end if;

  select id into v_auth_user_id from auth.users where lower(email) = lower(p_email) limit 1;

  if v_auth_user_id is null then
    raise exception 'Todavía no hay ninguna cuenta logueada con ese email';
  end if;

  update public.pilotos
  set auth_user_id = v_auth_user_id, email = lower(p_email), updated_at = now()
  where id = p_piloto_id;
end;
$$;
