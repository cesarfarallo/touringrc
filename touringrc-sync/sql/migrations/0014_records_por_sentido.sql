-- ============================================================
-- Migración 0014: separar records de circuito por sentido (normal/invertido)
--
-- `circuito_records` guardaba un solo récord por circuito+categoría, sin
-- distinguir en qué sentido se corrió -- cambiar de sentido puede
-- cambiar bastante el tiempo de vuelta (otro trazado de curvas), así
-- que un circuito con ambos sentidos corridos necesita un récord
-- propio para cada uno.
-- ============================================================

alter table public.circuito_records
  add column if not exists sentido text not null default 'normal'
    check (sentido in ('normal', 'invertido'));

alter table public.circuito_records
  drop constraint if exists circuito_records_circuito_id_clase_id_key;
alter table public.circuito_records
  add constraint circuito_records_circuito_id_clase_id_sentido_key
  unique (circuito_id, clase_id, sentido);
