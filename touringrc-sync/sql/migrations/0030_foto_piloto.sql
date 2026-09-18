-- ============================================================
-- Migración 0030: foto de piloto (subida real, reemplaza el placeholder)
--
-- Pedido del club: que cada piloto pueda subir su propia foto desde
-- "Mi Perfil", y que el admin pueda subir/cambiar la de cualquiera desde
-- el módulo Pilotos. La foto no varía por evento (a diferencia de la
-- marca del auto, migración 0029) -- vive directo en `pilotos`.
--
-- La escritura la hace exclusivamente la Edge Function `subir-foto-piloto`
-- con la service_role key (mismo criterio que `marcas_autos`/
-- `piloto_marca_evento`, migración 0029) -- la función decide si quien
-- llama puede subir esa foto puntual (dueño del piloto, o admin) antes de
-- tocar la base; no hace falta abrir ninguna policy de update en `pilotos`
-- para esto.
-- ============================================================

alter table public.pilotos add column if not exists foto_url text;

-- Bucket de Storage para las fotos -- público de lectura (se muestran en
-- la web sin login), sin policies de escritura para el cliente: solo la
-- service_role key (Edge Function) sube archivos ahí.
insert into storage.buckets (id, name, public)
values ('fotos-pilotos', 'fotos-pilotos', true)
on conflict (id) do nothing;

drop policy if exists "fotos_pilotos storage lectura publica" on storage.objects;
create policy "fotos_pilotos storage lectura publica" on storage.objects for select
  using (bucket_id = 'fotos-pilotos');
