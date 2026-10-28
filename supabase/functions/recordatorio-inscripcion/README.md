# `recordatorio-inscripcion`

Manda un recordatorio por email, **cada 2 días**, a los pilotos opt-in
(`pilotos.acepta_notificaciones = true`) que todavía no se anotaron a una fecha con la
inscripción online abierta — ver migración `0031_recordatorio_inscripcion_pendiente.sql`.
Distinta de `avisar-inscripcion` (migración 0026): esa manda un aviso único de "se abrió la
inscripción" a todos los opt-in apenas abre la ventana; esta se repite mientras la ventana
siga abierta, y solo le llega a quien **todavía no se anotó** (si ya se anotaste, dejás de
recibirlo). Las dos funciones son independientes — podés tener una sin la otra.

No hay sesión de usuario de por medio, así que se protege con el mismo tipo de secreto
compartido (`CRON_SECRET`) que el resto de las funciones de cron de este proyecto.

## 1. Deploy

```
npx supabase login
npx supabase link --project-ref <ref-del-proyecto>   # staging primero
npx supabase functions deploy recordatorio-inscripcion --no-verify-jwt
```

## 2. Secrets (Dashboard → Edge Functions → recordatorio-inscripcion → Secrets)

Reusa exactamente los mismos que ya tenga configurados `avisar-inscripcion` en ese proyecto —
no hace falta cargarlos de nuevo con otro valor, pero Supabase pide configurar los secrets por
función, así que copiá los mismos valores acá:

- `CRON_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `SITE_URL`

(Ver el README de `avisar-inscripcion` para el detalle de cada uno — son los mismos.)

## 3. Probar a mano (antes de programar el cron)

```
curl -X POST "https://<ref-del-proyecto>.supabase.co/functions/v1/recordatorio-inscripcion" \
  -H "x-cron-secret: <el-valor-de-CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Devuelve `{ ok: true, resultados: [...] }` con un resumen por evento abierto (`enviados: N`), o
`{ enviados: 0, motivo: "...", ... }` si todavía no le toca a ese evento puntual -- dos motivos
posibles: **"el primer recordatorio arranca 2 días después de que abrió la inscripción"** (la
ventana recién abrió, no pasaron los 2 días iniciales todavía -- ver "Cuándo arranca" abajo) o
**"todavía no pasaron 2 días desde el último recordatorio"** (ya se mandó al menos uno, pero no
hace tanto). Para forzar el envío ignorando cualquiera de las dos esperas (útil para probar)
mandá `{"forzar": true}` en el body en vez de `{}`.

### Cuándo arranca y cuándo termina

- **Arranca 2 días después de que abre la ventana de inscripción**, no el mismo día que abre --
  si `inscripcion_dias_antes` es 7, la ventana abre 7 días antes de la fecha pero el primer
  recordatorio recién sale al 5to día antes (`fecha - 7 + 2`). Las corridas siguientes respetan
  el mismo espaciado de 2 días entre una y la otra (`ultimo_recordatorio_inscripcion`).
- **Termina el día del evento**: el mismo filtro de ventana abierta (`hoy < fecha`) ya excluye
  la fecha del evento y cualquier día posterior -- no hace falta ningún chequeo extra para esto.

Para probarlo con un caso real en `dev`/staging: elegí una fecha cuya ventana de inscripción
esté abierta hoy, fijate que algún piloto de prueba tenga `email` + `acepta_notificaciones =
true` y que **no** tenga ya una fila en `inscripciones` para esa fecha (si ya se anotó, no es
destinatario — es justamente a quien no le tiene que llegar), y corré el `curl` de arriba con
`{"forzar": true}`.

## 4. Programar el cron (una vez que la prueba manual funcionó)

Mismo mecanismo que `avisar-inscripcion`/`generar-frases-destacadas` (pg_cron + pg_net, ver sus
READMEs para el detalle de las extensiones). El "cada 2 días" se resuelve ADENTRO de la función
(mismo motivo que el "cada 3 días" de `generar-frases-destacadas`: un cron de calendario cada 2
días reinicia el conteo en cada mes), así que el cron de afuera es simplemente diario:

```sql
select cron.schedule(
  'recordatorio-inscripcion-diario',
  '0 14 * * *', -- todos los días a las 14:00 UTC -- ajustar según convenga
  $$
  select net.http_post(
    url := 'https://<ref-del-proyecto>.supabase.co/functions/v1/recordatorio-inscripcion',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
```

Para desprogramarlo: `select cron.unschedule('recordatorio-inscripcion-diario');`

⚠️ Este SQL queda en el SQL Editor de cada proyecto, **no** en un archivo de migración
versionado — llevaría el `CRON_SECRET` en texto plano al repo.
