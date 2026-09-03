-- ============================================================
-- Migración 0013: el rol "piloto" pasa a ser el "visto bueno" del admin
--
-- Hasta ahora, un piloto recién creado por un login sin match (0 o 2+
-- candidatos, queda en "Vínculos pendientes") ya podía inscribirse a
-- una fecha antes de que ningún admin lo revisara -- la policy de
-- `inscripciones` y `actualizar_mi_transponder()` (migración 0008)
-- solo chequeaban que el piloto_id fuera el del usuario logueado, sin
-- mirar roles. El sistema de roles/módulos (migración 0003) existía
-- pero solo se usaba para armar el menú del frontend, nunca para
-- autorizar una escritura.
--
-- Ahora, tener el rol 'piloto' (que da acceso al módulo 'inscripcion',
-- ver seed de rol_modulos en 0003) es justamente ese visto bueno:
-- - Se otorga solo automáticamente cuando el login matcheó con
--   confianza contra el roster ya cargado (1 candidato único por email
--   o por nombre+apellido -- ver vincular_piloto_para_login(), 0012).
-- - Si no hay match (0 o 2+ candidatos), el piloto se crea igual (no
--   bloquea el login) pero SIN el rol -- queda pendiente hasta que un
--   admin lo confirme o lo fusione a mano desde "Vínculos pendientes".
--
-- Grandfather clause: todo piloto que ya existe al correr esta
-- migración se considera ya aprobado (recibe el rol 'piloto' de una),
-- para no bloquear de golpe a nadie que ya estaba usando la web o
-- cargado desde el roster de Live Timing sin pasar por este chequeo.
-- ============================================================

-- 1. Grandfather: todo piloto existente queda aprobado.
insert into public.piloto_roles (piloto_id, rol_id)
select id, 'piloto' from public.pilotos
on conflict do nothing;

-- 2. vincular_piloto_para_login() ahora otorga el rol 'piloto' en los
-- dos casos de match con confianza. En el caso "sin match -> piloto
-- nuevo + cola de revisión" NO lo otorga -- queda pendiente.
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
  if exists (select 1 from public.pilotos where auth_user_id = p_auth_user_id) then
    return;
  end if;

  select id into v_piloto_id
  from public.pilotos
  where auth_user_id is null
    and email is not null
    and lower(email) = lower(p_email)
  limit 1;

  if v_piloto_id is not null then
    update public.pilotos set auth_user_id = p_auth_user_id, email = p_email, updated_at = now()
    where id = v_piloto_id;
    insert into public.piloto_roles (piloto_id, rol_id) values (v_piloto_id, 'piloto') on conflict do nothing;
    return;
  end if;

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
        insert into public.piloto_roles (piloto_id, rol_id) values (v_candidatos[1], 'piloto') on conflict do nothing;
        return;
      end if;
    end if;
  end if;

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

-- 3. Enforce a nivel RLS: sin el módulo 'inscripcion' (que da el rol
-- 'piloto' por default), no se puede insertar en inscripciones -- así
-- no depende solo de que el frontend oculte el botón.
drop policy if exists "usuario se inscribe a si mismo" on public.inscripciones;
create policy "usuario se inscribe a si mismo" on public.inscripciones for insert
  with check (
    piloto_id in (select id from public.pilotos where auth_user_id = auth.uid())
    and public.tiene_modulo('inscripcion')
  );

-- 4. Mismo chequeo en la función de transponder (defensa en
-- profundidad -- hoy el frontend solo la llama después de una
-- inscripción exitosa, pero la función queda protegida igual).
create or replace function public.actualizar_mi_transponder(p_transponder text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tiene_modulo('inscripcion') then
    raise exception 'Tu cuenta todavía no fue aprobada por un admin';
  end if;

  update public.pilotos
  set transponder_number = nullif(trim(p_transponder), ''), updated_at = now()
  where auth_user_id = auth.uid();

  if not found then
    raise exception 'No hay ningún piloto vinculado a esta sesión';
  end if;
end;
$$;
