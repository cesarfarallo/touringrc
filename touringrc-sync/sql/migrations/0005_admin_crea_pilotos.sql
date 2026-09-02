-- ============================================================
-- Migración 0005: admin puede crear pilotos a mano desde la web
--
-- Hasta ahora `pilotos` solo se insertaba server-side (el trigger de
-- login, security definer) o desde el script local con la service
-- key. Hace falta una policy de insert para que el admin pueda dar
-- de alta un piloto a mano desde el panel (sin loguearse, sin email
-- todavía) -- ej. alguien que se anota en boca de pista y no
-- corrió nunca, o mientras se termina de cargar el roster completo.
-- ============================================================

drop policy if exists "admin inserta pilotos" on public.pilotos;
create policy "admin inserta pilotos" on public.pilotos for insert
  with check (public.es_admin());
