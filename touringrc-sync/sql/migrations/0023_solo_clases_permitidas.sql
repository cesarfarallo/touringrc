-- ============================================================
-- Migración 0023: eliminar categorías ajenas al club
--
-- `get_or_create_clase()`/`getOrCreateClase()` (sync_evento.py y la Edge
-- Function subir-resultado) creaban una fila nueva en `clases` por
-- CUALQUIER nombre de categoría que trajera el reporte de Live Timing, sin
-- filtrar -- si la pista se comparte con otro club/categoría el mismo día
-- (ej. "Touring" a secas, "GT", "1/8 IC"), esas categorías y sus
-- resultados terminaban cargados en la base igual que "Touring Eco
-- Stock"/"Touring Eco Modified", que son las únicas dos que corre este
-- club por ahora. El código ya se corrigió (ver CLASES_PERMITIDAS en
-- ambos lugares) para que de acá en adelante esas filas se ignoren en vez
-- de crearse -- esta migración limpia lo que ya había quedado cargado.
--
-- ⚠️ Esta migración se corrió una primera vez en producción con
-- 'Touring Eco 1:10 Stock'/'Touring Eco 1:10 Modified' como lista de
-- nombres permitidos -- una suposición sin confirmar contra la base real,
-- que resultó ser el nombre VIEJO (Live Timing exportaba así hasta 2025,
-- y pasó a exportar "Touring Eco Stock"/"Touring Eco Modified", sin
-- "1:10", a partir de 2026). Como ninguna fila de `clases` matcheaba esa
-- lista, la migración interpretó TODAS las categorías como ajenas y
-- borró también las dos reales del club (resultados, clasificación,
-- campeonato, inscripciones -- ver el ⚠️ "Incidente en producción" en
-- CLAUDE.md para el detalle completo y cómo se reconstruyó). Este archivo
-- ya quedó corregido con el nombre real y con el paso de normalización de
-- abajo, para que un ambiente que la corra de cero (staging, o un
-- proyecto nuevo) no repita el mismo desastre.
--
-- ⚠️ Aun así, antes de correr esto en cualquier proyecto conviene mirar
-- qué hay cargado hoy en `clases` para confirmar que la lista de abajo
-- sigue siendo correcta (por si Live Timing vuelve a cambiar el nombre):
--   select c.nombre, count(rf.id) as resultados_finales
--   from clases c left join resultados_finales rf on rf.clase_id = c.id
--   group by c.nombre order by c.nombre;
--
-- Si hace falta ajustar la lista de nombres permitidos, editar el array
-- `v_permitidas` de abajo (y CLASES_PERMITIDAS en el código) ANTES de
-- correr esta migración.
-- ============================================================

do $$
declare
  v_permitidas text[] := array['Touring Eco Stock', 'Touring Eco Modified'];
  v_sinonimo record;
  v_viejo_id uuid;
  v_nuevo_id uuid;
  v_borradas int;
begin
  -- Paso 1: si la base todavía tiene alguna fila con el nombre VIEJO
  -- ("Touring Eco 1:10 Stock"/"Touring Eco 1:10 Modified", exports de
  -- 2025 o anteriores), fusionarla en la fila del nombre nuevo (o
  -- renombrarla directo si el nombre nuevo todavía no existe) ANTES de
  -- borrar lo ajeno -- si no, el paso 2 de abajo la trataría como una
  -- categoría de otro club y la borraría junto con su historial real.
  for v_sinonimo in
    select * from (values
      ('Touring Eco 1:10 Stock', 'Touring Eco Stock'),
      ('Touring Eco 1:10 Modified', 'Touring Eco Modified')
    ) as t(viejo, nuevo)
  loop
    select id into v_viejo_id from public.clases where nombre = v_sinonimo.viejo;
    if v_viejo_id is null then
      continue; -- no había fila con el nombre viejo, nada que hacer
    end if;

    select id into v_nuevo_id from public.clases where nombre = v_sinonimo.nuevo;
    if v_nuevo_id is null then
      update public.clases set nombre = v_sinonimo.nuevo where id = v_viejo_id;
      continue;
    end if;

    -- Ya existen las dos filas (nombre viejo y nuevo) -- fusionar el
    -- viejo en el nuevo, mismo patrón "borrar el conflicto antes de
    -- reasignar" que fusionar_pilotos() (migraciones 0019/0020): se
    -- prioriza lo que ya tiene la fila nueva.
    delete from public.resultados_finales rf where rf.clase_id = v_viejo_id
      and exists (select 1 from public.resultados_finales x where x.clase_id = v_nuevo_id and x.evento_id = rf.evento_id and x.piloto_id = rf.piloto_id);
    update public.resultados_finales set clase_id = v_nuevo_id where clase_id = v_viejo_id;

    delete from public.resultados_ronda rr where rr.clase_id = v_viejo_id
      and exists (select 1 from public.resultados_ronda x where x.clase_id = v_nuevo_id and x.evento_id = rr.evento_id and x.ronda = rr.ronda and x.piloto_id = rr.piloto_id);
    update public.resultados_ronda set clase_id = v_nuevo_id where clase_id = v_viejo_id;

    delete from public.clasificacion c where c.clase_id = v_viejo_id
      and exists (select 1 from public.clasificacion x where x.clase_id = v_nuevo_id and x.evento_id = c.evento_id and x.piloto_id = c.piloto_id);
    update public.clasificacion set clase_id = v_nuevo_id where clase_id = v_viejo_id;

    delete from public.campeonato_puntos cp where cp.clase_id = v_viejo_id
      and exists (select 1 from public.campeonato_puntos x where x.clase_id = v_nuevo_id and x.campeonato_id = cp.campeonato_id and x.piloto_id = cp.piloto_id);
    update public.campeonato_puntos set clase_id = v_nuevo_id where clase_id = v_viejo_id;

    delete from public.inscripciones i where i.clase_id = v_viejo_id
      and exists (select 1 from public.inscripciones x where x.clase_id = v_nuevo_id and x.evento_id = i.evento_id and x.piloto_id = i.piloto_id);
    update public.inscripciones set clase_id = v_nuevo_id where clase_id = v_viejo_id;

    delete from public.circuito_records cr where cr.clase_id = v_viejo_id
      and exists (select 1 from public.circuito_records x where x.clase_id = v_nuevo_id and x.circuito_id = cr.circuito_id and x.sentido = cr.sentido);
    update public.circuito_records set clase_id = v_nuevo_id where clase_id = v_viejo_id;

    delete from public.homologaciones_neumaticos hn where hn.clase_id = v_viejo_id
      and exists (select 1 from public.homologaciones_neumaticos x where x.clase_id = v_nuevo_id and x.piloto_id = hn.piloto_id and x.evento_id = hn.evento_id);
    update public.homologaciones_neumaticos set clase_id = v_nuevo_id where clase_id = v_viejo_id;

    delete from public.clases where id = v_viejo_id;
  end loop;

  -- Paso 2: recién ahora, borrar lo que quede de categorías realmente
  -- ajenas al club. Tablas con clase_id sin "on delete cascade" -- hay
  -- que vaciarlas antes de poder borrar la fila de `clases` (si no,
  -- Postgres rechaza el borrado por la FK). circuito_records y
  -- homologaciones_neumaticos sí tienen cascade, así que no hace falta
  -- tocarlas acá.
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
