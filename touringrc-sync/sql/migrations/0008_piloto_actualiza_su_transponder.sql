-- ============================================================
-- Migración 0008: el piloto puede cargar su propio Nº de transponder
--
-- Al inscribirse online, si el piloto todavía no tiene un transponder
-- asociado en `pilotos`, se le da la opción (no obligatoria -- se puede
-- cargar después en la pista con Live Timing sin problema) de cargarlo
-- ahí mismo. `pilotos` no tiene ninguna policy de UPDATE para el propio
-- piloto (solo para admin, migración 0002) -- en vez de abrir una policy
-- de update genérica (que dejaría editar cualquier columna, incluido
-- nombre/apellido), se usa una función security definer bien acotada:
-- solo puede tocar transponder_number, y solo en la fila del propio
-- piloto (auth_user_id = auth.uid()), mismo patrón que fusionar_pilotos().
-- ============================================================

create or replace function public.actualizar_mi_transponder(p_transponder text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pilotos
  set transponder_number = nullif(trim(p_transponder), ''), updated_at = now()
  where auth_user_id = auth.uid();

  if not found then
    raise exception 'No hay ningún piloto vinculado a esta sesión';
  end if;
end;
$$;
