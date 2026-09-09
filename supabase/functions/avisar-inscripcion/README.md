# `avisar-inscripcion`

Avisa por email a los pilotos opt-in (`pilotos.acepta_notificaciones = true`) cuando se
habilita la inscripción online de una fecha — ver migración `0026_aviso_apertura_inscripcion.sql`.
Pensada para correr **una vez por día**, no para un usuario logueado, así que no usa el JWT de
Supabase Auth: se protege con un secreto compartido (`CRON_SECRET`) enviado en el header
`x-cron-secret`.

## 1. Deploy

```
npx supabase login
npx supabase link --project-ref <ref-del-proyecto>   # staging primero
npx supabase functions deploy avisar-inscripcion --no-verify-jwt
```

`--no-verify-jwt` es necesario: por default Supabase exige un JWT válido en `Authorization`
antes de dejar correr la función, pero acá no hay ningún usuario logueado de por medio.

## 2. Secrets (Dashboard → Edge Functions → avisar-inscripcion → Secrets, o `supabase secrets set`)

- `CRON_SECRET` — cualquier string random largo (ej. generado con `openssl rand -hex 32`).
  Nunca commitear el valor real; solo vive en Supabase.
- `RESEND_API_KEY` — API key de la cuenta de [Resend](https://resend.com) del club.
- `RESEND_FROM` — remitente **verificado** en Resend, ej.
  `"Touring 1:10 Arg <avisos@tudominio.com>"` (Resend exige verificar el dominio antes de
  poder mandar desde esa dirección).
- `SITE_URL` — requerida (la función devuelve error si falta). En producción,
  `"https://www.touring.com.ar"`; en staging, la URL del Preview de Vercel que estés usando (o
  cualquier URL estable que sirva el sitio). Se usa para dos cosas dentro del mail: el logo
  del club (se arma como `${SITE_URL}/logo.png`, la misma imagen que sirve `web/public/logo.png`
  en el sitio real) y el botón/link "Inscribite acá".

`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente, no hace falta
configurarlos.

## 3. Probar a mano (antes de programar el cron)

```
curl -X POST "https://<ref-del-proyecto>.supabase.co/functions/v1/avisar-inscripcion" \
  -H "x-cron-secret: <el-valor-de-CRON_SECRET>"
```

Devuelve `{ ok: true, resultados: [...] }` con un resumen por evento (`enviados: N`) o
`{ error: "..." }`. Se puede correr repetidas veces sin miedo: es idempotente — un evento ya
marcado (`eventos.notificacion_inscripcion_enviada = true`) no se vuelve a procesar hasta que
se resetee ese flag a mano en la base.

Para forzar una prueba con un evento real de `dev`/staging: elegí una fecha cuya ventana de
inscripción ya esté abierta hoy (o cargá una nueva con `inscripcion_dias_antes` chico), fijate
que algún piloto de prueba tenga `email` y `acepta_notificaciones = true` (togglealo desde Mi
Perfil, o a mano por SQL), y corré el `curl` de arriba.

## 4. Programar el cron (una vez que la prueba manual funcionó)

Requiere las extensiones `pg_cron` y `pg_net` habilitadas (Dashboard → Database → Extensions).
Corré esto en el SQL Editor, reemplazando `<ref-del-proyecto>` y `<CRON_SECRET>` por los
valores reales de tu proyecto:

```sql
select cron.schedule(
  'avisar-inscripcion-diario',
  '0 12 * * *', -- todos los días a las 12:00 UTC -- ajustar según convenga
  $$
  select net.http_post(
    url := 'https://<ref-del-proyecto>.supabase.co/functions/v1/avisar-inscripcion',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
```

Para desprogramarlo: `select cron.unschedule('avisar-inscripcion-diario');`

⚠️ Este SQL queda en el SQL Editor de cada proyecto (staging/producción por separado), **no**
en un archivo de migración versionado — llevaría el `CRON_SECRET` en texto plano al repo.
