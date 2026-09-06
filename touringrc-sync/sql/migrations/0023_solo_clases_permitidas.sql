-- ============================================================
-- Migración 0023: eliminar categorías ajenas al club
--
-- `get_or_create_clase()`/`getOrCreateClase()` (sync_evento.py y la Edge
-- Function subir-resultado) creaban una fila nueva en `clases` por
-- CUALQUIER nombre de categoría que trajera el reporte de Live Timing, sin
-- filtrar -- si la pista se comparte con otro club/categoría el mismo día
-- (ej. "Touring" a secas, "GT", "1/8 IC"), esas categorías y sus
-- resultados terminaban cargados en la base igual que "Touring Eco 1:10
-- Stock"/"Touring Eco 1:10 Modified", que son las únicas dos que corre
-- este club por ahora. El código ya se corrigió (ver CLASES_PERMITIDAS en
-- ambos lugares) para que de acá en adelante esas filas se ignoren en vez
-- de crearse -- esta migración limpia lo que ya había quedado cargado.
--
-- ⚠️ Antes de correr esto en un proyecto real, conviene mirar qué hay
-- cargado hoy en `clases` para confirmar que no se va a borrar algo que
-- en realidad sí correspondía al club (por si el nombre real no coincide
-- exacto con los dos de abajo):
--   select c.nombre, count(rf.id) as resultados_finales
--   from clases c left join resultados_finales rf on rf.clase_id = c.id
--   group by c.nombre order by c.nombre;
--
-- Si hace falta ajustar la lista de nombres permitidos, editar el array
-- `v_permitidas` de abajo (y el de CLASES_PERMITIDAS en el código) ANTES
-- de correr esta migración.
-- ============================================================

do $$
declare
  v_permitidas text[] := array['Touring Eco 1:10 Stock', 'Touring Eco 1:10 Modified'];
  v_borradas int;
begin
  -- Tablas con clase_id sin "on delete cascade" -- hay que vaciarlas antes
  -- de poder borrar la fila de `clases` (si no, Postgres rechaza el
  -- borrado por la FK). circuito_records y homologaciones_neumaticos sí
  -- tienen cascade, así que no hace falta tocarlas acá.
  delete from public.inscripciones
    where clase_id in (select id from public.clases where not (nombre = any (v_permitidas)));

  delete from public.resultados_finales
    where clase_id in (select id from public.clases where not (nombre = any (v_permitidas)));

  delete from public.resultados_ronda
    where clase_id in (select id from public.clases where not (nombre = any (v_permitidas)));

  delete from public.clasificacion
    where clase_id in (select id from public.clases where not (nombre = any (v_permitidas)));

  delete from public.campeonato_puntos
    where clase_id in (select id from public.clases where not (nombre = any (v_permitidas)));

  delete from public.clases where not (nombre = any (v_permitidas));
  get diagnostics v_borradas = row_count;

  raise notice 'Categorías eliminadas: %', v_borradas;
end $$;
