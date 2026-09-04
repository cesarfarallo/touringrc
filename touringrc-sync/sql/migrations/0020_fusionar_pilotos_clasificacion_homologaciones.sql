-- ============================================================
-- Migración 0020: fusionar_pilotos() también reasigna clasificacion
-- y homologaciones_neumaticos
--
-- Bug real encontrado usando el botón de fusión general (mismo tipo
-- que corrigió la migración 0019, pero en dos tablas que no existían
-- todavía cuando se escribió fusionar_pilotos() en la migración 0002):
--
-- - `clasificacion` (migración 0006, posición de largada) tiene una FK
--   normal (sin on delete cascade) hacia pilotos -- como
--   fusionar_pilotos() nunca la reasignaba, el DELETE final del
--   duplicado fallaba con
--   "update or delete on table pilotos violates foreign key constraint
--   clasificacion_piloto_id_fkey" apenas el duplicado tuviera una fila
--   ahí.
-- - `homologaciones_neumaticos` (migración 0017) sí tiene
--   on delete cascade, así que no rompía con un error -- pero por el
--   mismo motivo (nunca se reasignaba) el DELETE del duplicado borraba
--   en silencio su historial de homologaciones en vez de pasárselo al
--   correcto, perdiendo datos reales sin ningún aviso.
--
-- Mismo patrón que la 0019 para evitar duplicate key: si el correcto
-- ya tiene su propia fila para la misma clave, se descarta la del
-- duplicado antes de reasignar el resto.
-- ============================================================

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

  delete from public.resultados_finales rf_dup
  using public.resultados_finales rf_ok
  where rf_dup.piloto_id = p_duplicado_id
    and rf_ok.piloto_id = p_correcto_id
    and rf_ok.evento_id = rf_dup.evento_id
    and rf_ok.clase_id = rf_dup.clase_id;
  update public.resultados_finales set piloto_id = p_correcto_id where piloto_id = p_duplicado_id;

  delete from public.resultados_ronda rr_dup
  using public.resultados_ronda rr_ok
  where rr_dup.piloto_id = p_duplicado_id
    and rr_ok.piloto_id = p_correcto_id
    and rr_ok.evento_id = rr_dup.evento_id
    and rr_ok.clase_id = rr_dup.clase_id
    and rr_ok.ronda = rr_dup.ronda;
  update public.resultados_ronda set piloto_id = p_correcto_id where piloto_id = p_duplicado_id;

  delete from public.campeonato_puntos cp_dup
  using public.campeonato_puntos cp_ok
  where cp_dup.piloto_id = p_duplicado_id
    and cp_ok.piloto_id = p_correcto_id
    and cp_ok.campeonato_id = cp_dup.campeonato_id
    and cp_ok.clase_id = cp_dup.clase_id;
  update public.campeonato_puntos set piloto_id = p_correcto_id where piloto_id = p_duplicado_id;

  delete from public.inscripciones i_dup
  using public.inscripciones i_ok
  where i_dup.piloto_id = p_duplicado_id
    and i_ok.piloto_id = p_correcto_id
    and i_ok.evento_id = i_dup.evento_id
    and i_ok.clase_id = i_dup.clase_id;
  update public.inscripciones set piloto_id = p_correcto_id where piloto_id = p_duplicado_id;

  delete from public.clasificacion cl_dup
  using public.clasificacion cl_ok
  where cl_dup.piloto_id = p_duplicado_id
    and cl_ok.piloto_id = p_correcto_id
    and cl_ok.evento_id = cl_dup.evento_id
    and cl_ok.clase_id = cl_dup.clase_id;
  update public.clasificacion set piloto_id = p_correcto_id where piloto_id = p_duplicado_id;

  delete from public.homologaciones_neumaticos hn_dup
  using public.homologaciones_neumaticos hn_ok
  where hn_dup.piloto_id = p_duplicado_id
    and hn_ok.piloto_id = p_correcto_id
    and hn_ok.evento_id = hn_dup.evento_id
    and hn_ok.clase_id = hn_dup.clase_id;
  update public.homologaciones_neumaticos set piloto_id = p_correcto_id where piloto_id = p_duplicado_id;

  update public.piloto_alias set piloto_id = p_correcto_id where piloto_id = p_duplicado_id;

  update public.pilotos
  set auth_user_id = v_auth_user_id, email = coalesce(email, v_email), updated_at = now()
  where id = p_correcto_id;

  update public.vinculos_pendientes set resuelto = true where piloto_creado_id = p_duplicado_id;

  delete from public.pilotos where id = p_duplicado_id;
end;
$$;
