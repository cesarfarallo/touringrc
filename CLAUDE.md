# Touring RC — Plataforma web del campeonato

## Qué es esto

Plataforma web para un club de autos RC a escala (categoría "Touring Eco" y similares) que
sincroniza contra **Live Timing**, la app local (Windows) de cronometraje usada en pista. La
web tiene que resolver tres cosas:

1. **Calendario**: alta manual de cada fecha del campeonato por un admin.
2. **Inscripción**: habilitar la inscripción online un tiempo configurable antes de cada fecha
   (hoy: booleano manual `inscripcion_habilitada`; el objetivo es que se abra sola N días antes).
   A medida que se anotan pilotos, el admin tiene que poder descargar un `GenericImport.csv`
   para importarlo en Live Timing.
3. **Resultados y campeonato**: terminada la fecha, el admin sube los archivos que exporta Live
   Timing y la web actualiza tanto el resultado de esa fecha como el acumulado del campeonato.

Login pensado para pilotos: **sin usuario/clave propios**, guardando el email. Implementado con
Google + magic link a email (Apple Sign In se descartó por requerir cuenta de Apple Developer
paga — ver Fase B).

## Estado actual (lo que YA existe en el repo)

```
web/                           ← Fase A del roadmap: SPA Vite+React (nuevo)
├── .env.example               ← plantilla VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
├── src/
│   ├── lib/supabase.js        ← cliente de Supabase (anon key)
│   ├── theme.js                ← tokens de diseño + checklist de tipos de archivo
│   ├── hooks.js                 ← fetch de eventos / resultados / campeonato
│   ├── components/               ← piezas de UI portadas del mockup, con datos reales
│   └── App.jsx                   ← layout + tabs (Calendario / Resultados / Campeonato)
└── README.md                   ← cómo correrlo y deployarlo

touringrc-sync/
├── .env.example              ← plantilla de variables de entorno
├── .gitignore                ← ignora env/.env/__pycache__
├── requirements.txt          (pandas, xlrd, supabase, python-dotenv)
├── livetime_parsers.py       ← parsers de los .xls/.csv que exporta Live Timing
├── piloto_resolver.py        ← resolución de identidad de piloto entre reportes
├── sync_evento.py            ← CLI: sincroniza una carpeta de exports -> Supabase
├── files/                    ← muestras reales de exports de Live Timing (fixtures)
├── mockup/
│   └── touringrc-app-skeleton.jsx   ← mockup de UI original (referencia de diseño)
└── sql/
    ├── schema.sql             ← modelo de datos completo + RLS
    └── seed.sql                ← seed de ejemplo (1 campeonato + 7 fechas)
```

`web/` lee `eventos`, `resultados_finales` y `campeonato_puntos` en vivo desde Supabase
(lectura pública, sin auth). **Todavía no existe**: login real (Google/Apple), el flujo de
inscripción-online-escribe-en-la-base, exportación de inscriptos, ni panel admin real — los
botones de login/admin en `web/` son placeholders visuales. Ver "Roadmap" más abajo.

## Arquitectura objetivo

- **Datos + backend**: **Supabase** (Postgres + Auth + RLS). Ya está creado y resuelto — es la
  única pieza "productiva" hoy. No hace falta un backend propio: el frontend habla directo con
  Supabase usando la `anon key` y RLS hace de capa de autorización.
- **Frontend**: SPA **Vite + React**, sin servidor propio, deploy en **Vercel** (gratis).
  Se construye a partir del mockup (`touringrc-sync/mockup/touringrc-app-skeleton.jsx`) pero
  conectado a datos reales — el mockup es solo referencia de diseño/IA, no código para
  reusar tal cual.
- **Puente con Live Timing**: `touringrc-sync/` sigue siendo un **script CLI que corre local**
  en la PC del admin del club, no se hostea en ningún lado — Live Timing es una app de
  escritorio sin API propia, así que el flujo es manual: exportar desde Live Timing → correr
  `sync_evento.py --evento-id <uuid> --carpeta <ruta>` (y opcionalmente `--campeonato-id`).

## Modelo de datos (`touringrc-sync/sql/schema.sql`)

| Tabla | Qué representa | RLS |
|---|---|---|
| `pilotos` | Un piloto (independiente de si tiene cuenta web). `auth_user_id` nullable hasta que se vincula al primer login; `email` viene de la cuenta web, no de Live Timing. `registration_number` es un id externo pensado para inyectar EN Live Timing (dirección web→Live Timing, no implementada aún). | select público |
| `piloto_alias` | Mapea texto crudo de un reporte (`"Bruno Bonetta ARG"`) a un `piloto_id` ya resuelto. | sin RLS |
| `alias_pendientes` | Cola de revisión manual para nombres ambiguos (2+ candidatos posibles). | sin RLS |
| `clases` | Categorías recurrentes entre eventos (ej. `Touring Eco 1:10 Modified`). | sin RLS |
| `campeonatos` | Temporada/torneo (nombre, fecha_inicio, fecha_fin). | sin RLS |
| `eventos` | Calendario: una fila por fecha. `inscripcion_habilitada` (bool), `corrida` (bool, habilita ver resultados), `archivos` (jsonb checklist de qué se subió: `{"pilotos": true, "resultadosFinales": true, ...}`). | select público |
| `inscripciones` | Inscripción de un piloto a una fecha/clase, hecha desde la web. `sincronizado_a_livetime` marca si ya se exportó hacia Live Timing. Unique `(evento_id, piloto_id, clase_id)`. | insert/select solo del propio piloto vía `auth.uid()` |
| `resultados_finales` | Resultado final de un piloto en una clase de un evento (posición, resultado crudo, heat, `tq`, `vuelta_rapida`). Unique `(evento_id, clase_id, piloto_id)`. | sin RLS |
| `resultados_ronda` | Detalle por ronda/heat (laps, tiempos, promedios). Unique `(evento_id, clase_id, ronda, piloto_id)`. **Ojo**: la columna `tiempo interval` existe pero `sync_evento.py` no la completa hoy (solo llena `vueltas`). | sin RLS |
| `campeonato_puntos` | Acumulado de campeonato por clase/piloto (puntos, TQs, victorias, `detalle_por_fecha` jsonb). Unique `(campeonato_id, clase_id, piloto_id)`. | sin RLS |

**Nota de RLS**: hoy solo `pilotos`, `inscripciones` y `eventos` tienen RLS habilitado. El resto
queda con el comportamiento default de Postgres/Supabase (sin política = sin acceso vía la
`anon key` una vez que se habilite RLS en esas tablas, o acceso abierto si nunca se habilita —
a decidir explícitamente en la Fase F del roadmap, hoy es un punto ciego).

**Nota de diseño (`eventos` vs. `clase`)**: `eventos` NO tiene columna `clase` — un evento puede
tener resultados de varias clases a la vez (así lo modelan `resultados_finales` y
`campeonato_puntos`, cada uno con su propio `clase_id`). El mockup original simplificaba esto con
un campo `evento.clase` fijo; `web/` no lo reproduce — el filtro de clase vive en las vistas de
Resultados/Campeonato, no en la tarjeta de cada evento del calendario.

## Pipeline de sincronización (`touringrc-sync/`)

Herramienta CLI, un solo comando por fecha:

```
python sync_evento.py --evento-id <uuid-del-evento> --carpeta ./exports/fecha7
python sync_evento.py --evento-id <uuid> --carpeta ./exports/fecha7 --campeonato-id <uuid-del-torneo>
```

Variables de entorno requeridas: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (la `service_role`,
nunca la `anon key`, porque el script escribe). Se cargan desde un archivo `.env` local (no
commiteado — ver `.env.example`) vía `python-dotenv`, o exportadas a mano.

Orden de ejecución dentro de `main()`:

1. **`sync_pilotos`** — lee `GenericImport.csv` de la carpeta. El formato real (headers en
   `touringrc-sync/files/GenericImport.csv`, sin filas de datos todavía) tiene ~55 columnas —
   `FirstName, LastName, NickName, PhoneticName, Ability, ClassName, IsPaid, PillNumber,
   LocalRegisteredDateTime, RegistrationNumber, Region, ..., PermanentNumber, ...,
   ChassisManufacturer, ModelName, ModelYear, TransponderNumber, ..., Email, PhoneNumber,
   Birthday, ...` (lista completa en el propio CSV). **`sync_pilotos` hoy solo lee 7**:
   `FirstName`, `LastName`, `PhoneticName`, `Country`, `PermanentNumber`, `TransponderNumber`,
   `ChassisManufacturer`. Quedan sin usar, entre otras, `ClassName` (la clase asignada al
   piloto — importante para Fase D/E, ver abajo), `RegistrationNumber` (correspondería al
   `registration_number` de `pilotos`, el id que se inyecta EN Live Timing) y `Email`. Upsert en
   `pilotos` por match `ilike` de nombre+apellido.
2. **`sync_final_results`** — lee `FinalResults.xls`, resuelve cada piloto vía
   `PilotoResolver`, upsert en `resultados_finales` (marca `tq=True` si el flag `[TQ]` está en
   el nombre crudo).
3. **`sync_round_results`** — glob de `RoundResult-*.xls` (uno por round), upsert en
   `resultados_ronda`.
4. **`sync_top_times`** — glob de `RoundTopTimes-*.xls`, marca `vuelta_rapida=True` en el
   `resultados_finales` ya insertado del piloto que tuvo la vuelta más rápida de su clase.
5. **`sync_campeonato`** (opcional, solo si se pasa `--campeonato-id`) — lee
   `SeriesResultReport.xls`, upsert en `campeonato_puntos`. Se corre solo cuando hace falta
   actualizar el acumulado, no en cada fecha.

Cada paso llama `marcar_archivo(sb, evento_id, tipo)`, que actualiza el jsonb `archivos` de
`eventos` — es la fuente de datos del checklist admin (`ArchivosChecklist` en el mockup).

**Resolución de identidad de piloto** (`piloto_resolver.py`, clase `PilotoResolver`): dado un
texto crudo tipo `"Bruno Bonetta ARG [TQ]"`:
1. Busca alias exacto ya resuelto en `piloto_alias`.
2. Si no hay, parsea nombre/apellido/país y busca candidatos en `pilotos` (`ilike`).
3. 1 candidato → linkea y crea alias. 0 candidatos → **crea un piloto nuevo** (puede generar
   pilotos "fantasma" si `GenericImport.csv` de ese piloto todavía no se sincronizó). 2+
   candidatos → ambiguo, encola en `alias_pendientes` y devuelve `None` (esa fila se descarta
   del sync hasta resolución manual).

**Parsers** (`livetime_parsers.py`): todos los `.xls` de Live Timing tienen layout pensado para
imprimir (secciones por clase, columnas vacías intercaladas, headers repetidos), no para leer
como datos tabulares — cada parser reconstruye la estructura fila por fila con regex y
detección de secciones. Requiere `xlrd` porque son `.xls` viejos (formato OLE2/CDFV2), no
`.xlsx`.

## Mockup de frontend (`touringrc-sync/mockup/touringrc-app-skeleton.jsx`)

Archivo único, sin build, usado como **referencia de diseño e IA**, no como código a reusar tal
cual. Define:

- **Paleta/tipografía**: tema oscuro "asfalto de noche" (`#15181A` fondo, acento ámbar
  `#FFB400`), Oswald para títulos, Inter para texto, JetBrains Mono para todo dato numérico
  (tiempos, posiciones, puntos).
- **3 vistas** (tabs, sin routing real): **Calendario** (próxima fecha destacada + lista de
  eventos), **Resultados** (selector de fecha + tabla por clase, con selector de clase),
  **Campeonato** (standings acumulados por clase).
- **Modo admin**: checklist de archivos subidos por evento (`ArchivosChecklist`), badge de
  inscripción abierta/cerrada, botón "Agregar fecha al calendario" (sin funcionalidad real).
- **Login**: un botón que solo togglea estado local (`logueado`), con el copy "Ingresá con
  Google o Apple para inscribirte a una fecha" — no hay OAuth implementado.
- Los datos mock (`EVENTOS`, `RESULTADOS_POR_EVENTO`, `CAMPEONATO`, `TIPOS_ARCHIVO`) están
  modelados 1:1 con las tablas reales — el propio archivo lo anota: *"En producción esto sale
  de la tabla `resultados_finales` filtrada por evento_id"*.

## Convenciones

- Nombres de tablas/columnas de dominio en **español** (`pilotos`, `resultados_finales`,
  `inscripcion_habilitada`, etc.) — mantener esa convención en todo código nuevo que toque la
  base.
- **Nunca commitear** `env`/`.env` con credenciales reales — usar `touringrc-sync/.env.example`
  como plantilla. El script de sync usa la `service_role key` (bypasea RLS), tratarla como
  secreto de máxima sensibilidad.

## ⚠️ Seguridad

`touringrc-sync/env` y `touringrc-sync/sql/env` estuvieron trackeados en git con una
`SUPABASE_URL` y una `SUPABASE_SERVICE_KEY` reales en texto plano (la `service_role` key, que
bypasea RLS por completo). Se sacaron del tracking (quedan `.gitignore` + `.env.example` como
plantilla) y **la clave legacy expuesta ya fue invalidada** desde el dashboard de Supabase
(Settings → API Keys → "Disable JWT-based API keys", tras migrar a las claves nuevas
`publishable`/`secret`) — el valor que quedó en el historial de git ya no sirve para nada.

Pendiente (opcional, prolijidad): purgar el valor viejo del historial de git con
`git filter-repo` o BFG Repo-Cleaner — no es urgente porque la clave ya está muerta, pero
conviene coordinarlo en algún momento por ser una reescritura de historia compartida (afecta a
cualquiera con un clone existente).

Al correr `sync_evento.py` de acá en adelante, usar la **secret key** nueva (reemplazo de
`service_role` en el esquema de claves actual de Supabase) en el `env` local. Misma lógica para
el frontend: usar la **Publishable key** (reemplazo de `anon key`) en `VITE_SUPABASE_ANON_KEY`.

## Hosting — opciones gratuitas evaluadas

- **Base de datos + Auth + backend**: **Supabase** (ya resuelto). Free tier: ~500MB de DB,
  Auth con hasta 50k usuarios activos/mes, OAuth de Google y Apple nativos sin backend propio
  (Apple requiere cuenta de Apple Developer paga para configurar el provider — Google no).
- **Frontend**: SPA Vite+React, decidido: **Vercel** (free/hobby tier — deploy automático
  conectado al repo de GitHub, dominio `*.vercel.app`, HTTPS incluido). Alternativas
  equivalentes y también gratis si en algún momento conviene migrar: Cloudflare Pages
  (mejor si más adelante se suman Workers), Netlify.
- **Script de sync (`touringrc-sync/`)**: no necesita hosting — corre local en la PC del club
  porque Live Timing corre ahí. Si más adelante se quiere automatizar, evaluar GitHub Actions
  (trigger manual) o una Supabase Edge Function — no es necesario para el estado actual.

## Entornos: staging vs. producción

Dos ramas de git + dos proyectos de Supabase, para no arriesgar datos reales de un campeonato
en curso mientras se prueba algo:

| | Rama | Deploy (Vercel) | Base de datos |
|---|---|---|---|
| **Staging** | `dev` | Preview Deployment (URL única por push) | Proyecto Supabase separado, con `schema.sql` + `seed.sql` de prueba |
| **Producción** | `main` | Production Deployment (`*.vercel.app` / dominio final) | Proyecto Supabase de producción (el original, con datos reales del club) |

✅ Verificado de punta a punta: proyecto de staging creado en Supabase, `VITE_SUPABASE_URL`/
`VITE_SUPABASE_ANON_KEY` cargadas en Vercel con target Production (prod) y Preview (staging)
por separado, y un push a `dev` generó el Preview Deployment mostrando las 7 fechas del seed
de staging correctamente.

Flujo de trabajo:
1. Se labura y commitea en `dev` (local o acá), push a `dev` cada tanto (no hace falta que sea
   commit por commit, sí antes de dar algo por terminado).
2. Cada push a `dev` dispara automáticamente un **Preview Deployment** en Vercel, apuntando a
   la base de **staging** (env vars de Vercel escopeadas a "Preview" — ver más abajo). Se prueba
   ahí sin riesgo.
3. Cuando algo está confirmado, se lleva `dev` → `main` (fast-forward, como se hizo con Fase A).
   Vercel redeploya producción automáticamente contra la base real.

**Configuración en Vercel** (Settings → Environment Variables): las variables
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` están duplicadas con distinto *target*:
- Target **Production** → URL y Publishable key del proyecto de Supabase de **producción**.
- Target **Preview** (y opcionalmente Development) → URL y Publishable key del proyecto de
  **staging**.

Además, `VITE_APP_ENV=staging` con target **Preview únicamente** (sin cargar en Production)
prende una franja roja diagonal "DEV" en la esquina de la web
(`web/src/components/DevRibbon.jsx`) — para no confundir nunca a simple vista un Preview
Deployment con producción. Corriendo local con `npm run dev` la franja aparece sola, sin
necesidad de esta variable.

**Settings → Git → Production Branch** tiene que estar en `main` (así los pushes a `dev` generan
Preview y no pisan producción). Esto ya está bien configurado (Environments → Production trackea
`main`, Preview trackea "todas las ramas sin asignar", incluye `dev`).

⚠️ **Ojo con el botón "Redeploy"**: reusa la clasificación Production/Preview del deployment
original, no la recalcula según las reglas de rama actuales — si un deployment quedó mal
clasificado (ej. por una configuración vieja), redeployarlo no lo arregla. Para forzar una
reclasificación correcta hace falta un deployment nuevo genuino (push real a la rama).

**Cambios de schema SQL**: como son dos proyectos de Supabase separados (no hay migraciones
automáticas entre ellos), todo cambio de schema se escribe como un archivo nuevo en
`touringrc-sync/sql/migrations/` (ver el README ahí para la convención) y se corre a mano,
primero en staging para validar, después el mismo archivo sin cambios en producción.

## Roadmap

1. ✅ **Fase A — Scaffold del frontend** (`web/`): proyecto Vite+React, `@supabase/supabase-js`,
   las 3 vistas del mockup migradas a datos reales de lectura pública (`eventos`,
   `resultados_finales`, `campeonato_puntos`), sin auth todavía. **Deployado en Vercel**
   (Root Directory = `web/`, env vars cargadas — ver `web/README.md`). Usar la clave
   **`Publishable key`** (esquema nuevo de Supabase, prefijo `sb_publishable_...`) en
   `VITE_SUPABASE_ANON_KEY`, no la `anon key` legacy — las legacy quedaron deshabilitadas
   (ver sección de Seguridad). La UI ahora muestra un banner de error visible si falla la
   conexión a Supabase (antes fallaba en silencio y quedaba todo en blanco).
2. 🔧 **Fase B — Auth Google + email** (en curso): código listo, falta la config manual en
   Google Cloud/Supabase (ver checklist más abajo). Qué se hizo:
   - `touringrc-sync/sql/migrations/0001_auth_vincula_piloto.sql` — trigger
     `on_auth_user_created` (security definer) sobre `auth.users`: en el primer login busca un
     `piloto` con ese email sin vincular (`auth_user_id is null`) y lo vincula, o si no existe
     crea uno nuevo con `auth_user_id`/`email` seteados. Corre server-side para no necesitar
     policies de insert/update en `pilotos` desde el cliente (evita que alguien pueda "pisar" un
     piloto ajeno via RLS mal armada). Funciona igual sin importar el método de login (Google o
     email), porque escucha inserts en `auth.users`, no un provider específico.
   - `web/src/hooks.js` — `useSession()` (sesión de Supabase Auth reactiva),
     `usePilotoActual(session)` (piloto vinculado + `loading`, para distinguir "todavía
     consultando" de "no hay piloto vinculado") y `usePilotos()` (listado completo, para
     auditoría admin).
   - `web/src/components/LoginCard.jsx` — reemplaza Apple Sign In (requiere cuenta de Apple
     Developer paga) por un **magic link a email** (`supabase.auth.signInWithOtp`): sin
     contraseña propia, coherente con la idea original de "sin usuario/clave". Se muestra junto
     al botón de Google cuando no hay sesión.
   - `web/src/components/MiPerfil.jsx` — módulo de auto-chequeo: muestra, para el usuario
     logueado, si el trigger vinculó correctamente un piloto a su cuenta (o un aviso si no,
     útil para diagnosticar si la migración 0001 no corrió en ese proyecto de Supabase).
   - `web/src/components/PilotosAdmin.jsx` — en modo admin, tabla de **todos** los pilotos con
     email y si están vinculados o no (auditoría completa, no solo la propia cuenta). No
     necesita permisos especiales porque `pilotos` ya es de lectura pública.
   - `web/src/App.jsx` — logout real, nombre mostrado sale del piloto vinculado (o el email si
     todavía no hay nombre). El toggle "ADMIN" sigue siendo un demo visual local — no hay rol
     admin en la base todavía, eso es Fase E — pero ahora depende de estar realmente logueado.
   - Pendiente, manual (no se puede hacer desde el repo): crear credenciales OAuth en Google
     Cloud Console, habilitar el provider Google en Supabase Auth (en los dos proyectos,
     staging y prod), confirmar que el provider Email esté habilitado (suele venir activo por
     default) y correr la migración 0001 en los dos proyectos.
   - Apple Sign In: descartado por ahora (cuenta de Apple Developer paga); el magic link a
     email cubre el mismo caso de uso sin costo — se puede sumar Apple más adelante si hace
     falta.
3. **Fase C — Inscripción online**: formulario que inserta en `inscripciones` (la policy RLS ya
   existe). Reemplazar el booleano manual `inscripcion_habilitada` por una ventana calculada
   (ej. columnas `inscripcion_desde`/`inscripcion_hasta`, o `fecha - N días` con N configurable
   por evento o global).
4. **Fase D — Export de inscriptos**: botón admin que genera `GenericImport.csv` (formato real
   confirmado en `touringrc-sync/files/GenericImport.csv`, ~55 columnas) desde `inscripciones` +
   `pilotos` del evento — resuelve la dirección web→Live Timing que hoy falta. Como mínimo hay
   que completar `FirstName`, `LastName`, `ClassName` (viene de `inscripciones.clase_id` →
   `clases.nombre`) y, si están cargados, `Email`/`RegistrationNumber`/`PermanentNumber`/
   `TransponderNumber` — el resto de las columnas puede ir vacío, Live Timing las tolera.
5. **Fase E — Panel admin**: alta de eventos (insert en `eventos`), toggle/ventana de
   inscripción, upload de los archivos de resultados con el checklist ya modelado en
   `eventos.archivos`, disparo del sync (puede seguir siendo manual vía CLI o evolucionar a
   subida server-side).
6. **Fase F — Hardening**: decidir y completar RLS en las tablas que hoy no la tienen
   (`resultados_finales`, `resultados_ronda`, `campeonato_puntos`, `clases`, `campeonatos`,
   `piloto_alias`, `alias_pendientes`), tests para `livetime_parsers.py`, logging estructurado
   en `sync_evento.py`, y purga opcional del historial de git del secreto expuesto.
