-- ============================================================
-- Migración 0024: vaciar homologaciones de neumáticos (pilotos mal asignados)
--
-- El historial cargado en Oficina técnica quedó con pilotos mal
-- asignados a las homologaciones (arrastre de logins/fusiones previas).
-- Se decide arrancar de cero en vez de corregir fila por fila.
--
-- Borra homologaciones_neumaticos por completo -- homologaciones_pendientes
-- cascadea sola (`homologacion_id ... on delete cascade`, migración 0018),
-- así que no hace falta tocarla aparte. `marcas_neumaticos` (el catálogo
-- de marcas) NO se toca: no depende de pilotos, no hay nada mal asignado
-- ahí.
--
-- Después de correr esto, cualquier piloto vuelve a aparecer "apto para
-- homologar" en Oficina técnica (neumaticos_estado_clase() lo calcula en
-- vivo a partir de esta tabla) -- es el efecto esperado de arrancar de
-- cero.
-- ============================================================

delete from public.homologaciones_neumaticos;
