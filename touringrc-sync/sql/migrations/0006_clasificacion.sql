-- ============================================================
-- Migración 0006: tabla `clasificacion` (Leaderboard-Event*.xls)
--
-- Live Timing exporta, además de FinalResults/RoundResult/RoundTopTimes,
-- un reporte "Leaderboard-Event<N>.xls" con el resumen de clasificación
-- (mejor resultado combinado de las rondas clasificatorias, ej. "mejores
-- 2 de 3", más el detalle ronda por ronda y el criterio de desempate) --
-- es la posición de largada, distinta de resultados_finales (que es el
-- resultado de la final en sí). Mismo criterio de RLS que
-- resultados_finales/resultados_ronda: sin RLS, lectura abierta vía la
-- anon key (a decidir explícitamente en la Fase F de hardening).
-- ============================================================

create table if not exists public.clasificacion (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid references public.eventos(id),
  clase_id uuid references public.clases(id),
  piloto_id uuid references public.pilotos(id),
  posicion int,
  resultado text, -- combinado de las mejores rondas, ej. "32/10:18.306"
  rondas jsonb, -- detalle crudo por ronda, en orden: ["16/5:13.815", "16/5:16.920", ...]
  tie_breaker text,
  unique (evento_id, clase_id, piloto_id)
);
