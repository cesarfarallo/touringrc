-- ============================================================
-- Migración 0019: fusionar_pilotos() ya no rompe con duplicate key
--
-- Bug real encontrado al usar el botón de fusión general que se sumó a
-- PilotosAdmin.jsx (fusionar dos pilotos ya cargados, sin vínculo
-- pendiente de por medio): fusionar_pilotos() (migración 0002) hace un
-- UPDATE ciego de piloto_id = correcto en resultados_finales,
-- resultados_ronda, campeonato_puntos e inscripciones -- si el
-- "correcto" YA tenía su propia fila para el mismo (evento, clase[,
-- ronda]) que el "duplicado" (típico si ambos pilotos son la misma
-- persona real que corrió/se inscribió dos veces, una vez con cada
-- piloto), el UPDATE viola el unique constraint de esa tabla en vez de
-- fusionar. El caso reportado fue
-- "inscripciones_evento_id_piloto_id_clase_id_key", pero el mismo
-- problema existe en resultados_finales, resultados_ronda y
-- campeonato_puntos.
--
-- No pasaba con el flujo de VinculosPendientes porque ahí el
-- "duplicado" recién se acaba de crear por un login sin match y nunca
-- tiene historial propio todavía -- el botón general sí puede
-- encontrarse con dos pilotos que ambos tienen historial real.
--
-- Fix: antes de cada UPDATE, borrar las filas del duplicado que
-- entrarían en conflicto con una fila que el correcto YA tiene para la
-- misma clave (se prioriza lo que ya tiene el correcto, se descarta el
-- duplicado de esa fila puntual) -- el resto de las filas del
-- duplicado, las que no conflictúan, se reasignan normalmente.
-- piloto_alias no necesita este tratamiento: texto_crudo es unique por
-- sí solo (no por piloto_id), así que dos pilotos nunca pueden tener
-- alias en conflicto entre sí.
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

  update public.piloto_alias set piloto_id = p_correcto_id where piloto_id = p_duplicado_id;

  update public.pilotos
  set auth_user_id = v_auth_user_id, email = coalesce(email, v_email), updated_at = now()
  where id = p_correcto_id;

  update public.vinculos_pendientes set resuelto = true where piloto_creado_id = p_duplicado_id;

  delete from public.pilotos where id = p_duplicado_id;
end;
$$;
