# `generar-frases-destacadas`

Arma un set de frases "destacadas" con datos reales de resultados/campeonato (migración
`0027_frases_destacadas.sql`) -- ej. "El campeonato de Modified está al rojo vivo, ¿podrá X
mantener la punta o Y lo alcanzará?". El Calendario (`StartLights.jsx`, tarjeta destacada de la
próxima fecha) elige una al azar de ese set, mezclada con las frases genéricas de siempre, cada
vez que se carga la página.

Pensada para correr **una vez por día** vía pg_cron, igual que `avisar-inscripcion` -- no hay
sesión de usuario de por medio, así que se protege con el mismo tipo de secreto compartido
(`CRON_SECRET`) enviado en el header `x-cron-secret`. El "cada 3 días" del pedido original **no**
se resuelve programando el cron cada 3 días (con cron de calendario eso reinicia el conteo en
cada mes, y el intervalo real entre corridas queda irregular) sino con un chequeo *adentro* de la
función: mira cuándo se generó el último set para el campeonato vigente y no hace nada si
todavía no pasaron 3 días. Así el cron de afuera puede ser simplemente diario.

## 1. Deploy

```
npx supabase login
npx supabase link --project-ref <ref-del-proyecto>   # staging primero
npx supabase functions deploy generar-frases-destacadas --no-verify-jwt
```

## 2. Secrets (Dashboard → Edge Functions → generar-frases-destacadas → Secrets)

- `CRON_SECRET` -- podés reusar el mismo valor que ya tenga `avisar-inscripcion` en ese
  proyecto, o generar uno nuevo (`openssl rand -hex 32`). Da igual, son funciones
  independientes.

`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente.

## 3. Probar a mano (antes de programar el cron)

```
curl -X POST "https://<ref-del-proyecto>.supabase.co/functions/v1/generar-frases-destacadas" \
  -H "x-cron-secret: <el-valor-de-CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Devuelve `{ ok: true, generadas: N, detalle: [...] }` con el texto de cada frase armada, o
`{ ok: true, generadas: 0, motivo: "todavía no pasaron 3 días desde la última generación", ... }`
si ya se había generado un set hace menos de 3 días. Para forzar una regeneración inmediata
(útil mientras probás) mandá `{"forzar": true}` en el body en vez de `{}`.

Si da `{ generadas: 0, motivo: "..." }` sin ninguna frase incluso forzando, es esperable si
todavía no hay suficientes datos reales cargados (ver la sección "Qué detecta" abajo) -- no es
un error, el Calendario en ese caso muestra solo las frases genéricas de siempre.

## 4. Programar el cron (una vez que la prueba manual funcionó)

Mismo mecanismo que `avisar-inscripcion` (ver su propio README para más detalle de `pg_cron`/
`pg_net`). Corré esto en el SQL Editor, reemplazando `<ref-del-proyecto>` y `<CRON_SECRET>`:

```sql
select cron.schedule(
  'generar-frases-destacadas-diario',
  '0 13 * * *', -- todos los días a las 13:00 UTC -- ajustar según convenga
  $$
  select net.http_post(
    url := 'https://<ref-del-proyecto>.supabase.co/functions/v1/generar-frases-destacadas',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
```

Para desprogramarlo: `select cron.unschedule('generar-frases-destacadas-diario');`

⚠️ Este SQL queda en el SQL Editor de cada proyecto, **no** en un archivo de migración
versionado -- llevaría el `CRON_SECRET` en texto plano al repo.

## Qué detecta

Para cada categoría (`clases`) del campeonato vigente (el de `fecha_inicio` más reciente, mismo
criterio que el resto de la web):

- **Campeonato ajustado**: punteo y escolta separados por menos que el promedio de puntos que
  el puntero se lleva por fecha (`puntos_del_puntero / eventos_registrados`) -- una heurística
  simple para no depender de conocer la tabla de puntos exacta de Live Timing.
- **Ex-campeón sin ganar**: el campeón de la temporada INMEDIATA anterior (no todo el
  historial) para esa categoría, si corre esta temporada y todavía no ganó ninguna fecha
  (`wins_1ro = 0` en `campeonato_puntos` del campeonato vigente).
- **Nunca ganó una fecha**: un piloto con al menos 3 eventos corridos esta temporada, con algún
  podio (`wins_2do` o `wins_3ro` > 0) pero ninguna victoria (`wins_1ro = 0`).
- **Racha del último evento**: el mismo piloto ganó las dos fechas corridas más recientes de la
  temporada (heat de la A Final, posición 1 -- la B numera continuando después de la A, nunca
  vuelve a 1, así que "posición 1 en un heat que empieza con A" identifica al ganador real sin
  ambigüedad).

Cada detector devuelve como mucho una frase por categoría, para no saturar el set con variantes
muy parecidas entre sí. Si una categoría no tiene suficientes datos para ninguna historia (ej.
recién arranca la temporada), simplemente no aporta ninguna frase ese ciclo -- no es un error.
