-- ============================================================
-- Migración 0026: aviso por email cuando abre la inscripción de una fecha
--
-- Pedido: cuando se habilita la inscripción online de un evento (la ventana
-- calculada por inscripcionAbierta(), migración 0007), avisar por email a
-- los pilotos que tengan email cargado.
--
-- Opt-in explícito (decisión del club, no opt-out): nadie recibe nada hasta
-- que activa a mano el toggle "Avisarme cuando abra inscripción" en Mi
-- Perfil -- default apagado. Evita mandarle mail a alguien que nunca pidió
-- que le escribamos (ej. un piloto "fantasma" creado por PilotoResolver con
-- un email que en realidad no es de esa persona, o alguien que cargó su
-- email hace tiempo y se olvidó que existe esta opción).
--
-- `eventos.notificacion_inscripcion_enviada` evita mandar el aviso más de
-- una vez por evento -- la Edge Function `avisar-inscripcion` (nueva,
-- `supabase/functions/avisar-inscripcion/`) se piensa para correr una vez
-- por día vía pg_cron (ver instrucciones de setup en el README de la
-- función), así que sin este flag mandaría el mismo aviso todos los días
-- mientras la ventana siga abierta.
-- ============================================================

alter table public.pilotos
  add column if not exists acepta_notificaciones boolean not null default false;

alter table public.eventos
  add column if not exists notificacion_inscripcion_enviada boolean not null default false;

-- Mismo patrón que actualizar_mi_transponder() (migración 0008): `pilotos`
-- no tiene policy de update para el propio piloto (solo admin), así que en
-- vez de abrir una policy genérica se usa una función security definer
-- acotada a esta única columna.
create or replace function public.actualizar_mis_notificaciones(p_acepta boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pilotos
  set acepta_notificaciones = p_acepta, updated_at = now()
  where auth_user_id = auth.uid();

  if not found then
    raise exception 'No hay ningún piloto vinculado a esta sesión';
  end if;
end;
$$;
