-- ============================================================
-- Migración 0027: frases destacadas generadas con datos reales
--
-- Pedido: la frase alusiva de la tarjeta destacada del Calendario (hoy un
-- set fijo de frases genéricas, ver StartLights.jsx) sume también frases
-- armadas con los resultados/campeonato reales -- ej. "El campeonato de
-- Modified está al rojo vivo, ¿podrá X mantener la punta o Y lo
-- alcanzará?". Se generan con una Edge Function nueva
-- (`supabase/functions/generar-frases-destacadas/`, ver README ahí) que
-- corre cada ~3 días vía pg_cron (mismo patrón que `avisar-inscripcion`,
-- migración 0026) y arma un set nuevo completo cada vez -- el frontend
-- elige una al azar de ese set (mezclado con las genéricas de siempre)
-- una sola vez por carga de página.
-- ============================================================

create table if not exists public.frases_destacadas (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  categoria text not null, -- 'campeonato_ajustado' | 'ex_campeon' | 'nunca_gano' | 'racha'
  campeonato_id uuid references public.campeonatos(id),
  clase_id uuid references public.clases(id),
  generado_en timestamptz not null default now()
);

alter table public.frases_destacadas enable row level security;

-- Lectura pública (la consume el Calendario sin login), igual que
-- eventos/circuitos. Sin policy de insert/update/delete: la única
-- escritura la hace la Edge Function con la service_role key, que
-- bypasea RLS por completo -- no hace falta (ni conviene) abrirle
-- escritura a la anon key para esta tabla.
create policy "frases_destacadas_select_publico" on public.frases_destacadas
  for select using (true);
