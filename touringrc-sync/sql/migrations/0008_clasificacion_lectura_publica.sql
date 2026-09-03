-- La web publica la clasificación junto con resultados y calendario.
-- La función de sincronización escribe con service_role, pero el frontend
-- necesita poder leer estas filas con la publishable/anon key.
alter table public.clasificacion enable row level security;

drop policy if exists "clasificacion publica" on public.clasificacion;
create policy "clasificacion publica"
  on public.clasificacion
  for select
  using (true);
