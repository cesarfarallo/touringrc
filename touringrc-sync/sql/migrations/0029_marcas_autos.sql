-- ============================================================
-- Migración 0029: marca del auto por piloto y por evento
--
-- Pedido del club: mostrar la marca del auto (chasis) con la que corre
-- cada piloto al lado de su nombre. La fuente es la columna "Mfr" de
-- SeriesResultReport.xls -- esa columna no trae texto, trae el logo de
-- la marca incrustado como imagen dentro del .xls (ver el comentario
-- largo en supabase/functions/subir-resultado/parsers.ts, sección
-- "Logos de marca..." -- parser de bajo nivel escrito a mano, no hay
-- ninguna librería que lea esto). La marca puede cambiar de una fecha a
-- otra, así que se guarda por evento, no en `pilotos` directamente.
--
-- Esta es la PARTE 1 (parser + carga de datos): la migración y la
-- Edge Function ya guardan la marca de cada piloto en cada evento donde
-- se sube un SeriesResultReport.xls con logos legibles. Mostrar el logo
-- al lado del nombre en las pantallas (Resultados, Clasificación,
-- Campeonato, Pilotos, Circuitos) queda para una segunda parte.
-- ============================================================

-- 1. Catálogo de marcas -- mismo patrón que `marcas_neumaticos`
-- (nombre + logo_url), pero la carga NO es manual: la Edge Function crea
-- una fila nueva sola ("Marca sin nombre N") la primera vez que aparece
-- un logo que no matchea ninguna ya conocida (comparación por hash del
-- archivo de imagen, `hash_logo`) -- el admin la renombra después desde
-- la web (Fase 2, todavía no tiene pantalla propia).
create table if not exists public.marcas_autos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  logo_url text not null,
  hash_logo text not null unique,
  created_at timestamptz not null default now()
);

alter table public.marcas_autos enable row level security;

drop policy if exists "marcas_autos lectura publica" on public.marcas_autos;
create policy "marcas_autos lectura publica" on public.marcas_autos for select
  using (true);

drop policy if exists "admin escribe marcas_autos" on public.marcas_autos;
create policy "admin escribe marcas_autos" on public.marcas_autos for all
  using (public.es_admin())
  with check (public.es_admin());

-- 2. Marca del auto de cada piloto, por evento -- puede cambiar de una
-- fecha a otra, por eso no vive en `pilotos`. Sin policy de
-- insert/update/delete a propósito: la única escritura la hace la Edge
-- Function con la service_role key (mismo criterio que
-- `frases_destacadas`, migración 0027) -- no hace falta abrirle
-- escritura a la anon key.
create table if not exists public.piloto_marca_evento (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  piloto_id uuid not null references public.pilotos(id) on delete cascade,
  marca_id uuid references public.marcas_autos(id) on delete set null,
  actualizado_at timestamptz not null default now(),
  unique (evento_id, piloto_id)
);

alter table public.piloto_marca_evento enable row level security;

drop policy if exists "piloto_marca_evento lectura publica" on public.piloto_marca_evento;
create policy "piloto_marca_evento lectura publica" on public.piloto_marca_evento for select
  using (true);

-- 3. Bucket de Storage para los logos extraídos -- primera vez que este
-- proyecto usa Supabase Storage (hasta ahora todas las imágenes de la
-- app -- logo del club, dibujos de circuitos -- son archivos estáticos
-- en `web/public/`, pero estos logos se generan en tiempo real a partir
-- de un .xls subido, no se pueden commitear al repo de antemano).
-- Público de lectura (se van a mostrar en la web sin login) y sin
-- policies de escritura para el cliente -- solo la service_role key
-- (Edge Function) sube archivos ahí.
insert into storage.buckets (id, name, public)
values ('marcas-autos', 'marcas-autos', true)
on conflict (id) do nothing;

drop policy if exists "marcas_autos storage lectura publica" on storage.objects;
create policy "marcas_autos storage lectura publica" on storage.objects for select
  using (bucket_id = 'marcas-autos');
