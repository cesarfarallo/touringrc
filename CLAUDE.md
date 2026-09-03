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

`web/` lee `eventos`, `resultados_finales`, `clasificacion` y `campeonato_puntos` en vivo desde
Supabase (lectura pública, sin auth para esas tablas). Login real (Google + magic link),
inscripción online, export de inscriptos y panel admin ya están implementados — ver "Roadmap"
más abajo para el detalle fase por fase.

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
| `clases` | Categorías recurrentes entre eventos (ej. `Touring Eco Modified`). `homologacion_eventos_minimos` (migración 0017): cada cuántos eventos se puede homologar un juego de neumáticos nuevo — ver sección "Oficina técnica" más abajo. | select público, update para `tiene_modulo('homologacion')` (migración 0017) |
| `campeonatos` | Temporada/torneo (nombre, fecha_inicio, fecha_fin). | sin RLS |
| `eventos` | Calendario: una fila por fecha. `inscripcion_habilitada` (bool, **sin uso desde la migración 0007** — reemplazado por la ventana calculada), `inscripcion_dias_antes` (int, migración 0007: cuántos días antes de `fecha` se habilita la inscripción online para *esa* fecha en particular — nullable, cada evento configura el suyo), `corrida` (bool, habilita ver resultados), `archivos` (jsonb checklist de qué se subió: `{"resultadosFinales": true, ...}`), `circuito_id`/`circuito_sentido` (migración 0009: qué circuito se corre en esa fecha y en qué sentido — ver sección "Circuitos" más abajo). | select público, insert/update solo admin (migración 0004) |
| `inscripciones` | Inscripción de un piloto a una fecha/clase, hecha desde la web. `sincronizado_a_livetime` marca si ya se exportó hacia Live Timing. Unique `(evento_id, piloto_id, clase_id)`. | insert/select solo del propio piloto vía `auth.uid()` |
| `resultados_finales` | Resultado final de un piloto en una clase de un evento (posición, resultado crudo, heat, `tq`, `vuelta_rapida`). Unique `(evento_id, clase_id, piloto_id)`. | sin RLS |
| `resultados_ronda` | Detalle por ronda/heat (laps, tiempos, promedios). Unique `(evento_id, clase_id, ronda, piloto_id)`. **Ojo**: la columna `tiempo interval` existe pero `sync_evento.py` no la completa hoy (solo llena `vueltas`). | sin RLS |
| `clasificacion` | Posición de largada (migración 0006): resumen de las rondas clasificatorias que exporta Live Timing en `Leaderboard-Event*.xls` (mejor resultado combinado, ej. "mejores 2 de 3", `rondas` jsonb con el detalle crudo de cada ronda, `tie_breaker` con el criterio de desempate). Distinta de `resultados_finales`, que es el resultado de la final en sí. Unique `(evento_id, clase_id, piloto_id)`. | sin RLS |
| `campeonato_puntos` | Acumulado de campeonato por clase/piloto (puntos, TQs, victorias, `detalle_por_fecha` jsonb). Unique `(campeonato_id, clase_id, piloto_id)`. | sin RLS |
| `admins` | Lista de emails autorizados como admin (migración 0002). Reemplaza el viejo toggle "ADMIN" puramente visual del frontend por una verificación real del lado del servidor. | select propio (un admin se ve a sí mismo) |
| `vinculos_pendientes` | Cola de revisión (migración 0002): logins que no matchearon 1 a 1 contra el roster de `pilotos` ya cargado — o crearon un piloto nuevo (0 candidatos) o quedaron ambiguos (2+ candidatos con mismo nombre). El admin confirma o fusiona vía `fusionar_pilotos()`. | select/update solo admin |
| `circuitos` | Las 7 pistas del club (migración 0009). `numero` (1-7) es la clave que arma la ruta de la imagen en el frontend, no hay columna de imagen en la base. `nombre` editable desde la web. | select público, insert/update/delete solo admin |
| `circuito_records` | Récord **vigente** por circuito+categoría+sentido (migración 0009, `sentido` sumado en la 0014) — no un historial completo, el admin lo pisa a mano cuando se bate uno nuevo. `piloto_nombre` es texto libre (sin FK a `pilotos`, para poder cargar récords viejos de pilotos que nunca se loguearon a la web). Unique `(circuito_id, clase_id, sentido)` — normal e invertido tienen cada uno su propio récord, porque cambiar de sentido puede cambiar bastante el tiempo de vuelta. | select público, insert/update/delete solo admin |
| `marcas_neumaticos` | Catálogo de marcas de neumáticos para homologar (migración 0017). `logo_url` opcional (texto libre, sin upload de imágenes en esta app). | select/insert/update/delete para `tiene_modulo('homologacion')` |
| `homologaciones_neumaticos` | Un juego de neumáticos homologado (marca) para un piloto, en una categoría, en un evento puntual (migración 0017). Unique `(piloto_id, clase_id, evento_id)`. Ver `neumaticos_estado_clase()` para cómo se calcula si un piloto está apto para cargar una nueva. | select/insert/update/delete para `tiene_modulo('homologacion')` |

**Nota de RLS**: hoy `pilotos`, `inscripciones` (select también público desde la 0016),
`eventos`, `clasificacion` (migración 0008), `circuitos` y `circuito_records` (migración 0009),
`clases` (select público / update técnica, migración 0017), `marcas_neumaticos` y
`homologaciones_neumaticos` (migración 0017) tienen RLS habilitado. El resto queda con el
comportamiento default de Postgres/Supabase (sin política = sin acceso vía la `anon key` una vez
que se habilite RLS en esas tablas, o acceso abierto si nunca se habilita — a decidir
explícitamente en la Fase F del roadmap, hoy es un punto ciego).

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

**`parse_event_verification`** parsea `EventVerification-*.xls` — el reporte que Live Timing
exporta con los pilotos registrados/verificados en un evento, por clase, con `Name`, `Email`
(en la práctica siempre vacío), `Car` (número) y `Tx` (transponder). No es lo mismo que
`GenericImport.csv` (ese es para *importar* hacia Live Timing, no lo exporta la herramienta).
Se usa desde `cargar_roster.py` para volcar el roster ya cargado en Live Timing a `pilotos` —
ver sección siguiente.

## Admin real y vinculación de login por nombre (migración 0002)

El toggle "ADMIN" del header ahora depende de una verificación real: la tabla `admins` (email →
autorizado) más una función `es_admin()` (`security definer`, chequea
`auth.jwt() ->> 'email'`) usada en las policies de RLS. Antes de esta migración, el toggle era
puramente visual — cualquier usuario logueado lo podía prender sin que eso habilitara nada real
del lado del servidor (no era un agujero de seguridad porque nada escribía en la base todavía,
pero dejó de ser seguro en cuanto el panel de revisión de abajo necesitó escribir).

**Por qué hizo falta cambiar el trigger de vinculación de la migración 0001**: matchear por
email (como hacía 0001) no sirve para el roster que el club ya tiene cargado en Live Timing,
porque esos pilotos no tienen email guardado ahí (confirmado con un `EventVerification-*.xls`
real: ni un pilot tenía el campo Email completo). La migración 0002 reemplaza
`handle_new_user()`: intenta por email primero (por si acaso), y si no, por nombre+apellido
exacto contra pilotos sin vincular — misma filosofía que `PilotoResolver` para el lado del sync
de resultados, pero para el lado del login:
- 1 candidato → vincula solo.
- 0 o 2+ candidatos → crea un piloto nuevo igual (no bloquea el login) y encola una fila en
  `vinculos_pendientes` para que el admin la revise.

**Re-vincular también en cada re-login, no solo en el primero** (migración 0012): el trigger de
arriba es `AFTER INSERT ON auth.users`, así que solo corre la primera vez que se crea la cuenta.
Si el piloto vinculado se borra después (por error, o el admin lo borra a propósito) y esa
persona se vuelve a loguear, un re-login no inserta una fila nueva en `auth.users` — Supabase
Auth la actualiza (`last_sign_in_at`, etc.), no la crea de nuevo — así que sin este agregado no
pasaba nada, y la cuenta quedaba sin piloto para siempre hasta que un admin lo notara. La
migración 0012 factoriza el matching a `vincular_piloto_para_login()` (misma lógica: email →
nombre+apellido → crear nuevo + encolar) y la llama tanto desde `handle_new_user()` (INSERT)
como desde un trigger nuevo `on_auth_user_login` (`AFTER UPDATE`) — la función arranca
chequeando si ya hay un piloto vinculado, así que en el 99% de los logins (el caso normal) no
hace nada más que esa consulta.

**`cargar_roster.py`** (nuevo, standalone, no depende de `sync_evento.py` porque no hay un
evento/resultados de por medio): lee un `EventVerification-*.xls` y hace upsert en `pilotos`
por nombre+apellido (separando el texto crudo por espacios, el último token es el apellido —
funciona bien con nombres de 2 palabras, con nombres compuestos de 3+ palabras es una
heurística que puede fallar y hay que corregir a mano después). Completa
`permanent_number`/`transponder_number` si el archivo los trae. Sin `--archivo`, procesa
**todos** los `EventVerification-*.xls` que encuentre en `touringrc-sync/files/` (útil para
sumar varios eventos de una, cada uno puede traer pilotos que los otros no tenían):

```
python cargar_roster.py
python cargar_roster.py --archivo EventVerification-Event30.xls   # o uno puntual
```

**Panel admin `VinculosPendientes`** (`web/src/components/VinculosPendientes.jsx`): lista las
filas de `vinculos_pendientes` sin resolver. Para cada una, el admin puede:
- **Confirmar** que el piloto nuevo creado automáticamente está bien (marca `resuelto=true`).
- **Corregirle el nombre a mano** al piloto recién creado antes (o en vez) de confirmar —
  `NombreEditable` (`web/src/components/PilotoEditable.jsx`, compartido con `PilotosAdmin.jsx`),
  por si el trigger partió mal el nombre que trajo el login.
- **Fusionar** con uno de los candidatos ambiguos, si los hay, o con **cualquier otro piloto ya
  cargado** (buscador libre por nombre/apellido, no limitado a los candidatos automáticos que
  detectó el trigger) — llama a la función Postgres `fusionar_pilotos(duplicado, correcto)`
  (`security definer`, valida `es_admin()` internamente), que reasigna todo el historial
  (`resultados_finales`, `resultados_ronda`, `campeonato_puntos`, `inscripciones`,
  `piloto_alias`) del piloto duplicado al correcto, y borra el duplicado. Como el piloto
  duplicado se acaba de crear en el login, en la práctica nunca tiene historial propio que
  reasignar — es una fusión segura.

⚠️ Antes de correr la migración 0002 en cualquier proyecto, hay que editar el `INSERT` de la
sección 1 del archivo y poner el email real que va a ser admin (reemplazar
`'TU_EMAIL_AQUI@gmail.com'`).

**Editar y borrar pilotos** (migración 0010, `PilotosAdmin.jsx`): además del email, ahora
también se puede editar nombre/apellido de cualquier piloto (mismo `NombreEditable` de arriba),
y borrarlo (ícono de tacho, con confirmación — avisa si el piloto tiene una cuenta vinculada,
porque borrarlo deja a esa persona sin piloto asociado hasta que un admin lo revincule. El
trigger de vinculación corre una sola vez, al crearse la fila en `auth.users`, no en cada
login, así que re-loguearse no alcanza para arreglarlo). No hace falta
lógica de la app para proteger historial real: como ninguna FK hacia `pilotos` tiene
`on delete cascade`, Postgres rechaza el borrado solo si el piloto tiene resultados,
inscripciones o alias (el mensaje de error se lo indica al admin, sugiriendo Fusionar en su
lugar) — el borrado directo solo funciona limpio para pilotos sin historial real, que es
exactamente el caso de uso (un piloto mal creado por un login que hay que descartar).

⚠️ **Bug encontrado al escribir esta migración**: `fusionar_pilotos()` (migración 0002) borra
el piloto duplicado al final, pero `vinculos_pendientes.piloto_creado_id` seguía apuntándolo sin
`on delete set null` — ese borrado iba a violar la FK apenas la fila de `vinculos_pendientes`
que originó el duplicado (que siempre existe, es como se detecta el caso) quedara sin resolver
apuntándole. No se había notado porque el flujo real de fusión contra un candidato ambiguo
tampoco se había probado a fondo en producción todavía. La migración 0010 corrige la
constraint; `fusionar_pilotos()` en sí no necesitó cambios.

**Re-vincular un piloto a mano** (migración 0011, `vincular_piloto_por_email()`): gap real
encontrado al usar el borrado de arriba en la práctica — si un piloto vinculado se borra por
error, no había forma de recuperarlo solo con la web. Cargarle de nuevo el mismo email al
piloto (`EmailEditable`, ya existía) **no alcanza**: nada vuelve a correr el matching salvo el
trigger de la 0001, que es de una sola vez. La función busca la cuenta en `auth.users` (una
tabla que el cliente nunca puede leer directo, ni siquiera un admin vía RLS — de ahí que haga
falta una función `security definer`, mismo patrón que `fusionar_pilotos()`) y pisa
`pilotos.auth_user_id`. En la tabla de Pilotos, cualquier fila sin vincular que tenga un email
cargado muestra un botón "Vincular" (ícono de cadena) al lado de la ✗ que la llama — falla con
un mensaje claro si todavía no hay ninguna cuenta logueada con ese email.

## Roles y módulos (migración 0003)

En vez de codificar a mano qué puede hacer cada rol, la app se divide en **módulos**
(pantallas/funciones: `calendario`, `resultados`, `campeonato`, `inscripcion`,
`admin_pilotos`, `admin_calendario`, `admin_resultados`, `admin_roles`), y para cada
**rol** (`admin`, `piloto`, `tecnica`, `comisario`, `cronometrista`) el admin tilda a qué
módulos tiene acceso desde el propio panel — no hace falta tocar código para cambiar
permisos. Un piloto puede tener más de un rol.

- `roles`, `modulos`, `rol_modulos` (qué módulo ve cada rol), `piloto_roles` (qué rol tiene
  cada piloto) — las cuatro con RLS: lectura pública (hace falta para armar el menú del
  frontend), escritura solo admin.
- `es_admin()` se **redefine** en términos de este esquema (antes miraba la tabla `admins` de
  la 0002) — el rol `admin` pasa a ser un rol más, con todos los módulos por default. La
  migración migra automáticamente los admins existentes de `admins` a `piloto_roles` (por
  match de email). La tabla `admins` queda sin uso pero no se borra.
- `tiene_modulo(modulo_id)` / `mis_modulos()` — funciones helper para RLS y para que el
  frontend arme el menú (`supabase.rpc("mis_modulos")` devuelve todos los módulos del usuario
  logueado en una sola consulta).
- Seed inicial: `admin` → todos los módulos. `piloto` → `calendario`, `resultados`,
  `campeonato`, `inscripcion`. `tecnica`/`comisario`/`cronometrista` arrancan sin módulos
  asignados — se configuran desde el panel.

**Frontend**: `web/src/components/RolesAdmin.jsx` — matriz rol×módulo (tildar qué ve cada
rol); la asignación piloto×rol vive en `PilotosAdmin.jsx` junto con el resto de la gestión de
pilotos (ver más abajo). `useEsAdmin` chequea `piloto_roles` (no la tabla `admins`),
consistente con la redefinición de `es_admin()`.

⚠️ Igual que la 0002, esta migración depende de que ya hayas corrido la 0002 antes (usa la
tabla `admins` para el seed inicial) — correr en orden: 0001 → 0002 → 0003, primero en
staging.

## El rol `piloto` como aprobación del admin (migración 0013)

Hasta esta migración, el sistema de roles/módulos de la 0003 solo se usaba para armar el menú
del frontend — un piloto recién creado por un login sin match (0 o 2+ candidatos, ver más
abajo) ya podía inscribirse a una fecha antes de que ningún admin lo revisara, porque la policy
de `inscripciones` y `actualizar_mi_transponder()` (migración 0008) solo chequeaban que el
`piloto_id` fuera el del usuario logueado, sin mirar roles para nada.

Ahora tener el rol `piloto` (que da el módulo `inscripcion`) es ese "visto bueno":

- **Se otorga solo** cuando el login matcheó con confianza contra el roster ya cargado (1
  candidato único por email o por nombre+apellido, dentro de `vincular_piloto_para_login()`,
  migración 0012).
- **No se otorga** cuando no hay match único (0 o 2+ candidatos): el piloto se crea igual (no
  bloquea el login) pero sin el rol — queda pendiente hasta que un admin lo **confirme** o lo
  **fusione/vincule** a mano desde "Vínculos pendientes" (`VinculosPendientes.jsx`), momento en
  el que recién ahí se le otorga (`otorgarRolPiloto()`, upsert en `piloto_roles` con
  `ignoreDuplicates`).
- **Enforcement real, no solo de UI**: la policy de insert de `inscripciones` y
  `actualizar_mi_transponder()` ahora chequean `tiene_modulo('inscripcion')` además de la
  dueñidad del `piloto_id` — así no alcanza con que el frontend oculte el botón, está bloqueado
  también contra quien pegue el request directo a Supabase.
- **Grandfather clause**: la migración le da el rol `piloto` a todo piloto que ya existiera en
  la base al momento de correrla, para no bloquear de golpe a nadie ya cargado (roster
  importado, o ya logueado antes de este cambio).

**Frontend**: `EventoCard.jsx` y la tarjeta destacada de `App.jsx` deshabilitan el botón
"Inscribirme" (mostrando "Pendiente de aprobación") cuando el piloto está vinculado pero
`puedeInscribirse` (`useMisModulos().modulos.has("inscripcion")`) da `false`. `MiPerfil.jsx`
suma un tercer estado (ámbar, entre el rojo de "sin vincular" y el verde de "todo ok") con el
mismo mensaje, más detallado si quien lo ve es admin.

## Migración 0004: admin escribe en `eventos`

Agrega policies de `insert`/`update` en `eventos` gateadas por `es_admin()` — hacían falta
para el módulo "Gestión de eventos" (alta de fechas del calendario desde la web). Sin
prerrequisitos más allá de tener `es_admin()` definida (viene de la 0002/0003).

## Sección Admin (separada del Calendario público)

El botón "ADMIN" dejó de ser un toggle dentro del tab Calendario — ahora es un tab más en el
header (`web/src/App.jsx`), visible solo si `useEsAdmin` da `true`, que renderiza
`web/src/components/AdminPanel.jsx`. Adentro, tres sub-tabs (mismo patrón de antes, un
componente por tab en un array `TABS`):

- **Gestión de eventos** (`GestionEventos.jsx`): lista de eventos con el checklist de
  archivos (`ArchivosChecklist`, ya existía), un formulario para dar de alta una fecha nueva
  (nombre + fecha + días de antelación de inscripción, `insert` en `eventos`, funcional) y un
  botón "Subir resultados" **funcional** por evento: abre el selector de archivos del
  navegador (acepta selección múltiple), infiere el tipo de cada archivo por el nombre
  (`inferirTipo`, mismos patrones que `TIPOS_ARCHIVO` en `theme.js`) y los manda **de a uno, en
  secuencia** (no en paralelo) a la Edge Function `subir-resultado` — primero procesa
  `FinalResults.xls` y luego `RoundTopTimes-*.xls`, para que la fila de resultados exista antes
  de marcar la vuelta rápida; dentro de cada prioridad mantiene el orden elegido. Es secuencial a propósito,
  porque `marcarArchivo()` del lado de la función hace un read-modify-write sobre
  `eventos.archivos` y dos uploads simultáneos para el mismo evento se pisarían el checklist
  entre sí. Muestra el resultado de cada archivo por separado (✓/✗ con el nombre) y al final
  refresca el checklist una sola vez. Si algún archivo es `SeriesResultReport.xls` (tipo
  `campeonato`), primero resuelve el `campeonato_id` vigente (el de `fecha_inicio` más
  reciente, mismo criterio que `useCampeonato()`) antes de mandarlo. **Ojo con los errores**:
  `supabase.functions.invoke()` resume cualquier error HTTP de la función como el string
  genérico `"Edge Function returned a non-2xx status code"`, sin exponer el body real que
  devolvimos (`{ error: "..." }`) — `extraerMensajeError()` en `GestionEventos.jsx` va a buscar
  el mensaje real a `error.context` (la `Response` cruda del fetch) para que el ✗ rojo muestre
  el motivo real en vez del genérico.
- **Pilotos** (`PilotosAdmin.jsx`): fusiona lo que antes eran tres cosas separadas — la cola
  de `VinculosPendientes` (arriba, se muestra siempre pero queda vacía cuando no hay nada
  pendiente), la tabla de pilotos con email editable, y chips de rol tildables por piloto
  (reemplaza la tabla piloto×rol que antes vivía en `RolesAdmin.jsx`). Suma un buscador
  (nombre+apellido combinados), un filtro por uno o varios roles (chips, OR entre los
  tildados), y un filtro "Solo sin vincular" (`auth_user_id is null`) para poder completarle
  el email a mano a alguien que todavía no se logueó nunca, así el próximo login lo matchea
  directo por email. También permite **dar de alta un piloto a mano** (nombre, apellido,
  email opcional, roles) — requiere la policy de insert de la migración 0005 — útil para
  cargar a alguien nuevo sin esperar a que se loguee o corra `cargar_roster.py`.
- **Roles** (`RolesAdmin.jsx`): solo la matriz rol×módulo, sin la parte de pilotos.

`EventoCard.jsx` (usado en el Calendario público) perdió el prop `esAdmin` — ya no hace falta,
las decoraciones de admin (checklist, badge de inscripción) ahora viven exclusivamente en
`GestionEventos.jsx`.

## Edge Function `subir-resultado` (`supabase/functions/subir-resultado/`)

Corre server-side en Supabase (Deno) para que el botón "Subir resultados" de Gestión de
eventos pueda escribir en `resultados_finales`/`resultados_ronda`/`campeonato_puntos`/
`clases`/`pilotos`/`piloto_alias`/`alias_pendientes` sin exponer policies de escritura amplias
en esas tablas al navegador — la función usa la `service_role key` internamente (nunca
expuesta al cliente) recién después de verificar que quien llama es admin.

- **`eventos.corrida` se prende sola** al subir `FinalResults.xls` (`index.ts`, junto al
  `marcarArchivo()` de siempre). Antes de este fix nada la ponía en `true` fuera del seed
  inicial de 7 fechas — cualquier evento nuevo cargado desde la web quedaba con `corrida=false`
  para siempre, y como el selector de fecha de la sección Resultados (`eventosCorridos` en
  `App.jsx`) filtraba estrictamente por ese flag, ninguna fecha posterior a esas 7 aparecía ahí
  aunque tuviera resultados subidos. `App.jsx` además suma un criterio de respaldo (fecha
  pasada entra igual, aunque `corrida` no esté prendida) para no depender 100% del flag y cubrir
  también los eventos ya cargados antes de este fix sin necesitar un backfill manual en la base.
- **`parsers.ts`**: port a TypeScript de `touringrc-sync/livetime_parsers.py`, usando
  `npm:xlsx@0.18.5` (SheetJS) en vez de `pandas`/`xlrd`. Verificado **fila por fila, byte a
  byte** contra la salida real del parser de Python usando los archivos de muestra de
  `touringrc-sync/files/` (un test harness de Node armado ad-hoc para la comparación, no
  committeado). Detalle importante encontrado en esa verificación: pandas trata por default
  ciertos strings literales (`"N/A"`, `"NULL"`, `"null"`, etc. — su lista default de
  `na_values`) como valor faltante aunque la celda tenga texto real; SheetJS no lo hace solo,
  así que `limpiar()` en `parsers.ts` replica esa misma lista a mano (`NA_VALUES`) — sin este
  fix, `SeriesResultReport.xls` perdía de forma silenciosa fechas del campeonato con datos
  reales. **Si el formato de export de Live Timing cambia alguna vez, hay que actualizar los
  DOS parsers (Python y este) y volver a verificar que coincidan.** Excepción: `parseLeaderboard`
  (`Leaderboard-Event*.xls`, resumen de clasificación/posición de largada) es nuevo acá y
  todavía no tiene equivalente en `livetime_parsers.py` — se agregó directo en TypeScript
  porque el flujo real es 100% vía la web, no hay caso de uso hoy para el CLI de Python con
  este archivo. A diferencia de los otros parsers, lee por índice de columna crudo (sin
  compactar/filtrar nulos) en vez de por posición dentro de la fila ya compactada, porque
  `Car #`/`Mfr` suelen venir vacíos en los exports reales del club y la cantidad de columnas
  de ronda varía según el formato de clasificación (ej. "mejores 2 de 3"). El resultado se
  guarda en la tabla `clasificacion` (migración 0006) y se muestra en la web como un sub-tab
  separado dentro de "Resultados" (`Resultados finales` / `Clasificación`, ver
  `useClasificacionEvento` en `hooks.js` y `TablaClasificacion.jsx`). **Bug encontrado en la
  primera prueba real**: `Leaderboard-Event*.xls` trae **un sheet por clase** (ej. `Sheet1` =
  Modified, `Sheet2` = Stock), a diferencia de los demás reportes (un solo sheet, secciones por
  clase dentro del mismo sheet) — el parser solo leía `wb.SheetNames[0]`, así que se perdían en
  silencio todas las clases menos la primera. Corregido con `leerTodasLasHojasXls()` (itera
  todos los sheets del workbook, no solo el primero) — verificado contra el archivo real de
  muestra: pasó de leer 13 filas (solo Modified) a 20 (13 Modified + 7 Stock).
  `parseRecordsCircuito` (`RaceResultRecords*.xls`, "Track Records") es la otra excepción sin
  equivalente en Python, y con una estructura distinta a todos los demás reportes: las
  categorías van en **columnas lado a lado** (el reporte puede traer más categorías de las que
  usa el club, se ignoran las que no matchean ninguna fila de `clases`) en vez de bloques
  apilados verticalmente con filas en blanco entre uno y otro. Solo lee la primera fila de datos
  debajo de cada título (posición 1 = el récord vigente, `circuito_records` no guarda un
  historial). El reporte trae una fila de "rango de fechas" con `1/1/0001` como placeholder de
  "desde siempre" (LiveTime) — se ignora por completo, cada récord usa su propia fecha de
  columna; si esa fecha individual viniera con el mismo placeholder, también se descarta (año ≤
  1) en vez de guardar una fecha sin sentido. **Bug encontrado con un archivo real de más de dos
  categorías**: la primera versión asumía que todas las categorías compartían una única fila de
  títulos (válido con solo 2, como el primer archivo de prueba) — con más categorías, LiveTime
  arma un layout tipo diario a dos columnas donde cada columna apila sus propios títulos
  verticalmente e independientemente de la otra (la categoría 1 arriba-izquierda, la 2
  arriba-derecha, la 3 abajo-izquierda debajo de la 1, etc.), así que dos títulos de columnas
  distintas casi nunca caen en la misma fila salvo el primer par — con la versión vieja, la
  categoría Stock (bien al final del archivo) no se importaba nunca. Corregido escaneando el
  archivo entero por celdas-título (texto puro con las dos celdas vecinas de esa fila vacías —
  un nombre de piloto nunca cumple eso, el apellido ocupa la celda de al lado) en vez de cortar
  en la primera fila de títulos que aparece. Verificado contra dos archivos reales del club (uno
  con 2 categorías, otro con 7) con un test harness de Node ad-hoc, no committeado — mismo
  criterio que el resto de los parsers de esta función.
- **`piloto_resolver.ts`**: port de `piloto_resolver.py` (`PilotoResolver`), misma lógica de
  resolución de identidad (alias exacto → candidatos por nombre/apellido → 1 = linkea, 0 =
  crea piloto nuevo, 2+ = encola en `alias_pendientes`), pero contra el cliente JS de
  Supabase en vez de la librería Python.
- **`index.ts`**: el handler (`Deno.serve`). Contrato: `POST` con body JSON
  `{ eventoId?, tipo, contenidoBase64, campeonatoId?, circuitoId?, sentido? }`, donde `tipo` es
  uno de `"resultadosFinales"` (`FinalResults.xls`), `"detalleRondas"` (`RoundResult-*.xls`),
  `"vueltaRapida"` (`RoundTopTimes-*.xls`), `"clasificacion"` (`Leaderboard-Event*.xls`,
  posición de largada — ver tabla `clasificacion`, migración 0006), `"campeonato"`
  (`SeriesResultReport.xls`, requiere `campeonatoId`) o `"recordsCircuito"`
  (`RaceResultRecords*.xls`, requiere `circuitoId` y `sentido` en vez de `eventoId` — los
  récords se guardan por separado para normal e invertido, migración 0014 — ver sección
  "Circuitos" más abajo). **No** incluye `GenericImport.csv`: ese
  archivo es al revés, algo que la web tiene que *generar* (Fase D, botón "Exportar
  inscriptos"), nunca algo que el admin sube — sacado del checklist y del Edge Function
  después de confundirlo con un archivo de subida en una prueba real. Verifica el JWT del
  `Authorization: Bearer` header contra Supabase Auth, chequea que el piloto vinculado a esa
  sesión tenga el rol `admin` en `piloto_roles` (mismo criterio que `es_admin()` del lado de
  Postgres, pero reimplementado acá porque una Edge Function no corre dentro de una policy de
  RLS), y recién ahí despacha a `syncFinalResults`/`syncRoundResults`/`syncTopTimes`/
  `syncClasificacion`/`syncCampeonato`/`syncRecordsCircuito` — los primeros cuatro son ports
  directos de las funciones homónimas de `sync_evento.py` (`syncClasificacion` es nuevo, no
  existe en el CLI de Python todavía — pendiente si se necesita paridad ahí; `syncRecordsCircuito`
  tampoco tiene equivalente en Python, mismo motivo que `syncClasificacion`: el flujo real es
  100% vía la web), mismo orden y misma lógica de upsert. Al final, si el tipo es evento-scoped
  (todos menos `recordsCircuito`), llama `marcarArchivo()` (equivalente a `marcar_archivo()` en
  Python) para actualizar el jsonb `archivos` de `eventos`, que es lo que lee
  `ArchivosChecklist` — `recordsCircuito` no tiene evento asociado, así que se salta ese paso.
  Devuelve `{ ok: true, resumen }` o `{ error }`.
  La migración `0008_clasificacion_lectura_publica.sql` agrega la policy de lectura pública que
  necesita el frontend; sin ella la función puede sincronizar filas, pero la web devuelve cero.
- **Resaltado del piloto logueado**: las grillas de resultados finales, clasificación y
  campeonato reciben el `pilotoId` de `usePilotoActual`; la fila propia se destaca con fondo y
  nombre ámbar cuando hay una sesión autenticada.

**Deploy** (manual, el admin lo corre local — no hay CI/CD para Edge Functions todavía):
```
npx supabase login
npx supabase link --project-ref <ref-del-proyecto>   # staging o producción, uno a la vez
npx supabase functions deploy subir-resultado
```
No hace falta configurar secrets a mano: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y
`SUPABASE_ANON_KEY` los inyecta Supabase automáticamente en el entorno de la función. Hay que
deployarla **una vez en cada proyecto** (staging y producción son proyectos de Supabase
separados, ver sección "Entornos" más abajo) — deployar en uno no afecta al otro.

⚠️ No verificable end-to-end desde este entorno de desarrollo (sandbox sin acceso de red a
`supabase.co`): los parsers se validaron por comparación con el Python de referencia, pero la
función no se corrió nunca contra un proyecto de Supabase real. Probarla subiendo un archivo
real desde Gestión de eventos en staging antes de asumir que está lista para producción.

**Bug encontrado en la primera prueba real en staging**: las escrituras (`upsert`/`insert`/
`update`) en `syncFinalResults`/`syncRoundResults`/`syncTopTimes`/`syncCampeonato` (y
`syncPilotos`, que existía en ese momento y se sacó después junto con el tipo `"pilotos"`, ver
más abajo) y en `piloto_resolver.ts` no chequeaban el `error` que devuelve el cliente de
Supabase — si el insert fallaba (ej. desajuste de tipos, FK inválida), el código seguía de
largo, contaba la fila como sincronizada igual, y la función devolvía `{ ok: true }` con el
checklist tildado aunque no se hubiera escrito nada. Corregido: ahora cada escritura chequea
`error` y tira una excepción con el nombre de la tabla y la fila que falló, así el mensaje rojo
del botón "Subir resultados" muestra el motivo real en vez de un falso éxito silencioso. Hay
que re-deployar la función (`supabase functions deploy subir-resultado`) para que este fix
tome efecto en los proyectos ya deployados.

## Inscripción online y export de inscriptos (Fase C/D)

- **Ventana de PRE-inscripción por evento** (migración 0007, `eventos.inscripcion_dias_antes`):
  reemplaza el booleano manual `inscripcion_habilitada`. La web calcula si la inscripción está
  abierta en el cliente (`inscripcionAbierta()` en `EventoCard.jsx`): abierta desde
  `fecha - inscripcion_dias_antes` días hasta el día **anterior** a `fecha` — el día de la
  fecha ya se cierra (es pre-inscripción, no algo que se pueda hacer el mismo día de la
  carrera). Mismo corte para el botón "Exportar inscriptos" de Gestión de eventos
  (`exportacionHabilitada()` en `GestionEventos.jsx`): deja de tener sentido exportar una vez
  que llegó el día del evento. El admin configura los días de antelación por evento desde
  Gestión de eventos (`InscripcionDiasEditable`, editable tanto al dar de alta una fecha nueva
  como en cualquier fecha ya existente) — nulo significa "sin inscripción online para esa
  fecha" (el botón queda deshabilitado). En el otro extremo, el botón "Subir resultados" de la
  misma fila (`subidaHabilitada()`) recién se habilita el día de la fecha en adelante — no
  tiene sentido subir resultados de una carrera que todavía no se corrió.
- **Botón "Inscribirme"** (`EventoCard.jsx`, Calendario público): visible solo logueado y
  dentro de la ventana. `useInscripcionPiloto(eventoId, pilotoId)` (`hooks.js`) chequea si el
  piloto ya tiene una inscripción para ese evento — si la tiene, muestra la categoría en vez
  del botón (no se soporta anotarse a más de una categoría por evento desde la UI, aunque el
  modelo de datos lo permitiría — la columna sigue llamándose `clase`/`clase_id` en la base y
  en el código, "Categoría" es solo el texto que ve el piloto). Si no, un formulario inline con
  un `<select>` (`useClases()`) inserta en `inscripciones` — la policy RLS de insert/select ya
  existía (`piloto_id in (select id from pilotos where auth_user_id = auth.uid())`, ver
  `schema.sql`), no hizo falta ninguna migración de permisos nueva. El `<select>` se
  precarga con la categoría de la última inscripción del piloto (`useCategoriaPreferida()` en
  `hooks.js`, consulta `inscripciones` ordenado por `fecha_inscripcion`) — la mayoría corre
  siempre en la misma; sigue siendo editable a mano, y una vez que el piloto lo toca no se
  vuelve a pisar solo.
- **Transponder al inscribirse** (migración 0008, `actualizar_mi_transponder()`): si el piloto
  ya tiene `transponder_number` cargado en `pilotos`, el formulario lo muestra como dato
  informativo, con un lápiz al lado para poder cambiarlo por otro con el que quiera correr esa
  fecha en particular (por si el habitual no es con el que va a correr). Si no tiene ninguno
  cargado, muestra directo el input — no es obligatorio completarlo, se puede
  agregar/cambiar después en la pista con Live Timing sin problema. `pilotos` no tenía ninguna
  policy de UPDATE para el propio piloto (solo para admin, migración 0002); en vez de abrir una
  policy de update genérica (que dejaría editar cualquier columna, incluido nombre/apellido),
  se usa una función `security definer` bien acotada que solo toca `transponder_number` y solo
  en la fila del propio piloto (`auth_user_id = auth.uid()`), mismo patrón que
  `fusionar_pilotos()`.
- **Export de inscriptos** (`web/src/lib/genericImport.js` + botón "Exportar inscriptos" en
  `GestionEventos.jsx`): arma el `GenericImport.csv` real (56 columnas, header tomado tal cual
  de `touringrc-sync/files/GenericImport.csv`) a partir de `inscripciones` del evento, join con
  `pilotos` y `clases` — completa `FirstName`/`LastName`/`ClassName`/`Email`/
  `RegistrationNumber`/`PermanentNumber`/`TransponderNumber`, el resto de las columnas queda
  vacío (Live Timing las tolera). Descarga el archivo directo en el navegador (`Blob` +
  `<a download>`), sin pasar por ningún backend — es una lectura pública de datos que ya son
  del propio club, no hizo falta una Edge Function para esto. El admin lo importa a mano en
  Live Timing (no hay API para automatizar ese lado).

⚠️ **Bug encontrado al armar el botón de compartir por redes (más abajo)**: `inscripciones`
solo tenía la policy de select "cada uno ve las suyas" (ownership por `auth_user_id`) — ningún
admin podía leer las inscripciones de otro piloto. El botón "Exportar inscriptos" de arriba
llevaba tiempo devolviendo en silencio solo la inscripción propia del admin (si tenía alguna),
no la lista completa del evento. La migración 0015 agrega una policy de select para admin (más
una de insert para admin, ver "Inscribir un piloto a mano" más abajo) — Postgres combina
policies permisivas del mismo comando con OR, así que el autoservicio de cada piloto sigue
funcionando exactamente igual, sin tocarlo.

- **Compartir inscriptos por redes** (botón "Compartir inscriptos" en la tarjeta destacada de
  la próxima fecha, `App.jsx`, solo admin): arma un texto plano (pilotos agrupados por
  categoría, numerados) y lo copia al portapapeles con `navigator.clipboard.writeText()` — sin
  pasar por ningún backend, mismo criterio que el CSV de arriba. Requiere la policy de select
  de admin de la migración 0015 (sin ella, la consulta a `inscripciones` devuelve vacío para
  cualquiera que no sea el propio inscripto).
- **Ver inscriptos (popup público)** (botón "Ver inscriptos" al lado del anterior, visible para
  cualquiera sin necesidad de estar logueado): abre `ModalInscriptos.jsx`, mismo listado
  agrupado por categoría pero en un popup en vez de copiarlo — comparten el fetch
  (`obtenerInscriptosPorClase()` en `App.jsx`). Requiere la migración 0016 (lectura pública de
  `inscripciones` — antes de eso, un visitante no admin y no dueño de la inscripción veía la
  lista vacía).
- **Inscribir un piloto a mano** (`InscribirPiloto` en `GestionEventos.jsx`, un botón por fila
  de evento): para pilotos que se anotan en boca de pista, o cualquier caso que el admin quiera
  cargar directo sin pasar por el autoservicio. Buscador libre contra el roster completo
  (`usePilotos()`, no limitado a pilotos ya vinculados a una cuenta), elige categoría, e
  inserta en `inscripciones` con la policy de insert para admin de la migración 0015 — bypasea
  a propósito el chequeo de `tiene_modulo('inscripcion')` que aplica al autoservicio (migración
  0013): que el admin lo elija de la lista de pilotos ya es la aprobación en sí, no tiene
  sentido bloquearlo por el mismo motivo que bloquea el autoservicio de alguien sin revisar
  todavía.

## Ganadores en la tarjeta del Calendario

`useGanadoresPorEvento()` (`hooks.js`) trae en una sola consulta el ganador de cada heat de
`resultados_finales` para **todos** los eventos (no tiene sentido una consulta por tarjeta) y
arma `{ [eventoId]: { [claseNombre]: { A: nombre, B: nombre } } }` — mismo criterio que
`calcularPodios()` en `TablaResultados.jsx` para distinguir final A de final B por el texto del
heat (`/^a/i` / `/^b/i`), así funciona igual si el evento corrió una sola final (todo bajo
"A Final") o dos. `EventoCard.jsx` muestra esta info debajo del header de la tarjeta, solo para
fechas con `resultadosDisponibles` (pasadas o `corrida`), con ícono de copa (oro) para la A y
medalla (plata) para la B.

⚠️ **Bug encontrado en la primera prueba real**: la primera versión filtraba directo por
`posicion = 1`, pero Live Timing numera la B Final **continuando** después de la A (ej. A: 1-10,
B: 11-20), no reinicia en 1 — así que el ganador de la B nunca tenía `posicion = 1` y quedaba
afuera en silencio. Corregido: en vez de filtrar por posición, agrupa las filas por
`evento+clase+heat` y toma la de **menor posición dentro de ese grupo** como ganador — mismo
criterio que ya usaba `calcularPodios()`, ahora replicado acá.

**Dibujo del circuito y récords, no solo pilotos**: `EventoCard.jsx` y la tarjeta destacada de
la próxima fecha (`App.jsx`) muestran el dibujo del circuito asociado (64px, con fondo blanco —
ver nota de contraste más abajo) usando el mismo helper `rutaImagenCircuito()`, sacado a
`web/src/lib/circuitos.js` para no duplicarlo entre `EventoCard.jsx`, `CircuitosView.jsx` y
`App.jsx` (la tarjeta destacada no lo tenía al principio, se sumó a pedido).

⚠️ **Contraste de los dibujos de circuito**: los PNG de `circuitos-normales`/`circuitos-invertidos`
tienen fondo **transparente** con el trazado en colores oscuros (marrón grisáceo para el asfalto,
líneas blancas/negras) — sobre el fondo oscuro de la app (`T.surfaceRaised`) el trazado se perdía
casi por completo, más aún reducido a una miniatura chica. Todos los lugares donde se muestra el
dibujo (`EventoCard.jsx`, la tarjeta destacada, y las dos instancias de `CircuitosView.jsx`:
la miniatura del grid y la imagen grande) ahora usan fondo blanco (`#FFFFFF`) en vez de
`T.surfaceRaised`, con un `padding` chico para que el trazado no quede pegado al borde.

## Responsive / mobile (`web/`)

Toda la UI usa estilos inline (no hay Tailwind ni CSS modules), así que la mayoría de lo
responsive se resuelve directo en los `style={{...}}` de cada componente — `flexWrap: "wrap"`
en las filas que pueden no entrar en una pantalla angosta, y `overflowX: "auto"` envolviendo
cada `<table>` (con un `minWidth` en el propio `<table>` para forzar el scroll horizontal en
vez de apretar las columnas) en `TablaResultados.jsx`, `TablaClasificacion.jsx`,
`TablaCampeonato.jsx`, la tabla de `PilotosAdmin.jsx` y la matriz de `RolesAdmin.jsx`.

Lo único que necesitó una media query real (no se puede con estilos inline) es el **header**
de `App.jsx`: en pantallas ≤640px el nav de tabs (Calendario/Resultados/Campeonato/Admin) pasa
a su propia fila con scroll horizontal en vez de apretarse junto al logo y el botón de login,
que también pasan a apilarse. Eso vive en `RESPONSIVE_CSS` (`theme.js`), inyectado igual que
`FONTS` vía `<style>` en `App.jsx`, con las clases `.header-inner`/`.nav-tabs`/`.page-content`.

Verificado con Playwright en un viewport de 320px (iPhone SE) desde este entorno de
desarrollo (sin datos reales, por la falta de acceso de red a Supabase, pero sí la estructura
del layout): sin overflow horizontal de la página en Calendario ni Resultados, y el nav de
tabs scrollea para llegar a las pestañas que no entran. Falta verificar con datos reales en un
celular de verdad (tablas largas, formularios con teclado on-screen, etc.).

## Branding

El nombre visible del producto es **"Touring 1:10 Arg"** — distinto del nombre del
repo/proyecto interno ("Touring RC", usado en este documento y en el código como
identificador). Vive **solo** en el `<title>` de `web/index.html` (la pestaña del navegador,
marcadores, historial) — el header de la web (`App.jsx`) no repite el nombre como texto, va
directo al logo, sin wordmark al lado (decisión explícita: "en el home solo el logo"). En
entornos de desarrollo (`npm run dev` local o Preview de Vercel con `VITE_APP_ENV=staging`),
ese título de pestaña suma además el sufijo `" (DEV)"` (seteado con `document.title` en un
`useEffect` de `App.jsx`, mismo criterio `ES_DEV` que usa `DevRibbon.jsx`) — la franja roja
diagonal ya cubre el aviso visual dentro de la página, esto es un aviso adicional visible en
el título de la pestaña/marcadores/historial. El logo real de la categoría (auto + wordmark
"touring RC", PNG con transparencia) vive en `web/public/logo.png` y se muestra dentro del
banner superior vía `<img src="/logo.png">` a 152px de alto, centrado y sin posicionamiento
absoluto. El banner tiene 172px de alto para contener el logo sin recortarlo ni cruzarlo con
la navegación. El favicon sigue siendo
`web/public/favicon.svg`, con fondo circular gris oscuro (`#4B5563`), logo cian (`#00D9FF`)
y contorno negro fino.

## Calendario y cuenta regresiva

El home consulta todas las fechas de `eventos` y ordena las tarjetas del calendario por fecha
descendente: primero muestra la fecha más reciente (sea futura o pasada) y luego continúa hacia
las más antiguas. No se limita el listado ni se filtran fechas. La próxima fecha
se calcula como la fecha futura más cercana, independientemente del valor de `corrida`, para no
seguir mostrando una fecha pasada si el flag quedó desactualizado.

`StartLights.jsx` muestra un árbol de largada estilo drag strip: dos etapas rojas, tres ámbar y
una verde, cada una con dos luces, apiladas verticalmente sobre un poste. Las etapas se van
prendiendo progresivamente durante la última semana (misma fórmula de `progreso` de siempre,
en base a `horasRestantes`); la verde recién se prende el día de la fecha. La última etapa que
se prendió titila siempre, para marcar "esto es lo nuevo" — una vez que la verde está prendida,
el titileo pasa a ella; durante las últimas 12 horas, titilan todas juntas (`todasTitilan`).
Arriba se muestra "FALTAN N DÍAS" (o "HOY"/"¡SE LARGA!") y una frase alusiva que cambia
diariamente durante los últimos 30 días. Diseño elegido entre varias propuestas comparadas en
un artifact aparte (no versionado en el repo) antes de implementarlo acá — reemplaza el semáforo
horizontal de siete columnas estilo F1 de la versión anterior.

En `EventoCard.jsx`, una fecha pasada habilita `Ver resultados` aunque `corrida` sea falso. Para
una inscripción abierta, el usuario no autenticado también ve un botón `Inscribirme` que inicia
el login; el formulario real sigue requiriendo una sesión y el piloto vinculado.

La tarjeta destacada de la próxima fecha también incluye un botón `Inscribirme` con ícono.
Si el usuario no está autenticado inicia el login; si ya inició sesión, abre y cierra un
formulario propio dentro de la tarjeta destacada. La tarjeta del evento tiene otro formulario
independiente que se abre y cierra desde su propio botón. Ambos estados se sincronizan después
de una inscripción: una vez inscripto, los dos botones quedan deshabilitados.

El módulo administrativo `GestionEventos.jsx` usa el mismo orden del calendario: fecha más
reciente primero, sea futura o pasada, y luego las fechas más antiguas.
Cada evento permite editar inline su nombre y fecha mediante el ícono de lápiz; el guardado
actualiza la fila de `eventos` y refresca el listado.

## Circuitos (migración 0009)

Nuevo tab del nav ("Circuitos", `CircuitosView.jsx`), a la par de Calendario/Resultados/
Campeonato. Modela el club como **7 circuitos físicos, cada uno con dos sentidos de recorrido**
("normal"/"invertido") — no 14 circuitos independientes. El dibujo de cada uno **no se guarda en
la base**: son 14 PNG estáticos ya presentes en el repo (`web/public/circuitos-normales/
Circuito{1-7}.png` y `circuitos-invertidos/Circuito{1-7}.png`, 4499×2105px), y el frontend arma
la ruta a partir de la columna `numero` de `circuitos` (`rutaImagen()`, repetida igual en
`CircuitosView.jsx` y `EventoCard.jsx` — si se agrega una tercera vista que necesite el dibujo,
conviene sacarla a un helper compartido). El seed de la migración carga los 7 con nombre
genérico ("Circuito 1".."Circuito 7") — el admin los renombra desde la propia vista con el
ícono de lápiz (mismo patrón que el nombre/fecha de `GestionEventos.jsx`).

- **Asociar un circuito a una fecha**: `eventos.circuito_id` (nullable, `on delete set null`) +
  `eventos.circuito_sentido` (`'normal'`/`'invertido'`, default `'normal'`). Se edita inline
  desde `GestionEventos.jsx` (`CircuitoEditable`, mismo patrón de lápiz que
  `InscripcionDiasEditable`). `useEventos()` trae el join (`circuitos ( id, numero, nombre )`)
  para que `EventoCard.jsx` pueda mostrar el dibujo (48px, esquina superior izquierda de la
  tarjeta) sin una consulta aparte — si no hay circuito asociado, no se muestra nada.
- **Vista pública**: grid de los 7 circuitos (thumbnail + nombre) para elegir uno: imagen grande
  del sentido elegido (toggle Normal/Invertido) al lado de una tabla con el récord vigente por
  categoría **para ese sentido** (`useCircuitoRecords(circuitoId, sentido)`) — normal e
  invertido tienen cada uno su propio récord por categoría (migración 0014: cambiar de sentido
  puede cambiar bastante el tiempo de vuelta), así que la tabla se recarga sola al tocar el
  toggle.
- **Récords** (`circuito_records`): es el récord **vigente** por circuito+categoría+sentido, no
  un historial completo — cargar uno nuevo (`upsert` con `onConflict:
  "circuito_id,clase_id,sentido"`) pisa el anterior de esa misma combinación. `piloto_nombre` es
  texto libre a propósito (sin FK a `pilotos`): hay récords viejos de pilotos que nunca se
  loguearon a la web, y forzar un match contra el roster para cargarlos sería más fricción que
  valor. La carga/edición/borrado de récords y el renombrado de circuitos quedan visibles inline
  solo si `useEsAdmin()` da `true` — no hay un sub-tab aparte en el panel Admin porque está
  atado 1 a 1 a esta vista (mismo criterio que las decoraciones de admin que `EventoCard.jsx`
  mostraba antes de mudarse a `GestionEventos.jsx`, pero acá se quedan en la vista pública porque
  no tiene sentido duplicar la tabla en dos lugares).
- **Importar records desde Live Timing** (botón "Importar records", solo admin, al lado del
  título "Récords por categoría"): sube el reporte `RaceResultRecords*.xls` ("Track Records")
  contra la Edge Function `subir-resultado` (`tipo: "recordsCircuito"`, ver esa sección más
  arriba), para el circuito **y el sentido** que estén activos en la vista en ese momento (el
  archivo no indica ninguno de los dos, los elige el admin con el toggle Normal/Invertido antes
  de subir). Pisa el récord anterior de esa categoría+sentido — a propósito, el reporte siempre
  trae el mejor tiempo vigente. Solo importa las categorías cuyo nombre matchea exacto contra
  una fila de `clases` ya cargada; el resto se ignora (el reporte puede traer más categorías de
  las que usa el club) y se lista en el resumen. La fecha de "inicio de reporte" que trae el
  archivo (`1/1/0001`, placeholder de LiveTime) nunca se usa — cada récord guarda su propia
  fecha real, o ninguna si no vino. `archivoABase64`/`extraerMensajeError` se sacaron a
  `web/src/lib/edgeFunction.js` (antes vivían solo en `GestionEventos.jsx`) para no duplicarlos
  acá.

⚠️ No se pudo confirmar con el club el nombre real de cada uno de los 7 circuitos — el seed usa
nombres genéricos como placeholder, pendiente que el admin los renombre desde la web.

## Oficina técnica: homologación de neumáticos (migración 0017)

Nuevo tab del nav ("Oficina técnica", `OficinaTecnica.jsx`), visible solo si `useMisModulos()`
tiene el módulo `homologacion` — nuevo módulo otorgado por default a los roles `admin` y
`tecnica` (los únicos que pueden entrar; el resto ni ve el tab). No alcanza con ocultar el tab:
`marcas_neumaticos` y `homologaciones_neumaticos` tienen RLS con `tiene_modulo('homologacion')`
en todas las operaciones, así que aunque alguien pegue el request directo a Supabase sin ese
módulo, no lee ni escribe nada.

**Regla de negocio**: cada categoría permite homologar un juego de neumáticos nuevo cada *N*
eventos — *N* es `clases.homologacion_eventos_minimos` (columna nueva, default `1`), no un
nombre de categoría hardcodeado en el código, para poder ajustarlo sin tocar código si cambia
el reglamento. El seed de la migración deja `Touring Eco Modified` en 1 (un juego nuevo por
cada evento) y `Touring Eco Stock` en 2 (tiene que haberse presentado a mínimo 2 eventos desde
la última homologación) — editable inline desde la propia vista (`EventosMinimosEditable`,
requirió habilitar RLS en `clases`, que hasta ahora no tenía ninguna — quedó con select público
y update para `tiene_modulo('homologacion')`).

"Presentarse a un evento" se mide por tener una fila en `resultados_finales` para esa categoría
en ese evento (corrió de verdad), no por estar inscripto (esa es solo la intención de asistir,
`inscripciones`).

- **`neumaticos_estado_clase(p_clase_id)`** (función SQL, `language sql` sin `security
  definer` — corre con los permisos de quien llama, así que la RLS de arriba ya la protege
  sola): para cada piloto que alguna vez corrió esa categoría, calcula la fecha y marca de su
  última homologación, cuántos eventos pasaron desde entonces (contando solo eventos con
  resultado real posterior a esa fecha) y si está **apto** (`eventos_desde_ultima >=
  eventos_requeridos`, o directamente apto si nunca homologó nada). `useNeumaticosEstadoClase()`
  en `hooks.js` la llama vía `supabase.rpc(...)`.
- **`marcas_neumaticos`**: catálogo simple (nombre + `logo_url` opcional) que técnica/admin
  arman a medida que hace falta — no hay un seed de marcas conocidas, ni upload de imágenes en
  esta app (`logo_url` es una URL externa que se pega a mano). `SelectorMarca` en
  `OficinaTecnica.jsx` muestra el logo si hay URL cargada, o un círculo con las iniciales de
  respaldo si no.
- **Cargar una homologación**: por piloto, botón "Homologar" (deshabilitado si no está apto)
  abre un formulario inline con selector de evento (`<select>` de todos los eventos, más
  reciente primero) y el selector visual de marca — inserta en `homologaciones_neumaticos`
  (`unique (piloto_id, clase_id, evento_id)`, no se puede cargar dos veces la misma
  combinación).

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
- **"Categoría" en la UI, "clase" en la base y el código**: la tabla `clases`/columna
  `clase_id` no se renombra (sería una migración innecesaria), pero todo texto visible para el
  piloto/admin dice "Categoría" — decisión explícita para que el sitio hable en los términos
  que usa el club. Si se agrega una pantalla nueva que muestre esto, seguir el mismo criterio.
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
2. ✅ **Fase B — Auth Google + email**: código y config manual terminados, **verificado
   funcionando en staging y en producción** (login con Google y con magic link a email, trigger
   vinculando el piloto correctamente en los dos proyectos de Supabase). Qué se hizo:
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
     email (editable a mano, click para corregirlo) y si están vinculados o no (auditoría
     completa, no solo la propia cuenta). No
     necesita permisos especiales porque `pilotos` ya es de lectura pública.
   - `web/src/App.jsx` — logout real, nombre mostrado sale del piloto vinculado (o el email si
     todavía no hay nombre). El toggle "ADMIN" ahora depende de un rol real en la base (ver
     sección "Roles y módulos" más abajo, migración 0003).
   - Config manual (Google Cloud Console + Supabase Auth, en los dos proyectos) ya hecha y
     confirmada: credenciales OAuth de Google (proyecto `touringrc`, con las redirect URIs de
     staging y prod cargadas), provider Google habilitado, provider Email confirmado activo, y
     la migración 0001 corrida en los dos proyectos de Supabase.
   - Apple Sign In: descartado por ahora (cuenta de Apple Developer paga); el magic link a
     email cubre el mismo caso de uso sin costo — se puede sumar Apple más adelante si hace
     falta.
3. ✅ **Fase C — Inscripción online**: ventana de inscripción configurable **por evento**
   (migración 0007, `inscripcion_dias_antes`, reemplaza el booleano manual
   `inscripcion_habilitada`) y botón "Inscribirme" funcional en el Calendario público (ver
   sección "Inscripción online y export de inscriptos" más arriba) — inserta en
   `inscripciones` con la policy RLS que ya existía desde el baseline. No pre-completa
   nombre/apellido en un formulario propio porque no hace falta: el piloto ya está identificado
   por la sesión, solo elige la clase. Pendiente (no bloqueante): correr `cargar_roster.py` con
   el roster completo del club si todavía no se hizo (hoy solo confirmado con el
   `EventVerification-Event30.xls` de ejemplo) — sin eso, un piloto que se loguea por primera
   vez y no matchea contra el roster igual puede inscribirse (el trigger de la migración 0002
   le crea un piloto nuevo), pero puede terminar duplicado si después se carga el roster real.
4. ✅ **Fase D — Export de inscriptos**: botón "Exportar inscriptos" en Gestión de eventos
   genera el `GenericImport.csv` real (56 columnas, confirmado en
   `touringrc-sync/files/GenericImport.csv`) desde `inscripciones` + `pilotos` + `clases` del
   evento y lo descarga directo en el navegador — ver sección de arriba
   (`web/src/lib/genericImport.js`). Completa `FirstName`, `LastName`, `ClassName`, y si están
   cargados `Email`/`RegistrationNumber`/`PermanentNumber`/`TransponderNumber`; el resto de las
   columnas queda vacío, Live Timing las tolera. El admin todavía tiene que importarlo a mano
   en Live Timing — no hay API para automatizar ese lado.
5. ✅ **Fase E — Panel admin**: sección Admin separada del Calendario público, con roles
   configurables por módulo (migración 0003), alta de eventos (migración 0004, módulo
   "Gestión de eventos") y subida de resultados desde la web funcionando de punta a punta vía
   la Edge Function `subir-resultado` (ver sección de arriba) — código escrito y verificado
   (parsers comparados fila por fila contra el Python de referencia), **pendiente el primer
   deploy real** (`supabase functions deploy subir-resultado` en staging y producción) y una
   prueba end-to-end subiendo un archivo real desde el botón de Gestión de eventos, algo que no
   se pudo hacer desde este entorno de desarrollo por no tener acceso de red a Supabase.
6. **Fase F — Hardening**: decidir y completar RLS en las tablas que hoy no la tienen
   (`resultados_finales`, `resultados_ronda`, `campeonato_puntos`, `clases`, `campeonatos`,
   `piloto_alias`, `alias_pendientes`), tests para `livetime_parsers.py`, logging estructurado
   en `sync_evento.py`, y purga opcional del historial de git del secreto expuesto.
7. ✅ **Fase G — Circuitos** (migración 0009, no estaba en el roadmap original, se agregó a
   pedido después de que aparecieran sin usar 14 imágenes de circuitos en el repo): apartado
   público nuevo con las 7 pistas del club (dibujo normal/invertido + récord vigente por
   categoría), asociación de circuito a cada fecha del calendario (se ve el dibujo en la tarjeta
   del evento), y carga/edición de récords y renombrado de circuitos para el admin — ver sección
   "Circuitos" más arriba. Código escrito y verificado con build/lint; **no corrido contra un
   proyecto de Supabase real** (mismo motivo que el resto de las migraciones recientes: sin
   acceso de red a Supabase desde este entorno) — falta correr la migración 0009 en staging y
   producción, y confirmar con el club el nombre real de cada circuito (el seed usa nombres
   genéricos como placeholder).

⚠️ Numeración de migraciones: hay dos archivos `0008_*.sql` distintos y sin relación entre sí
(`0008_piloto_actualiza_su_transponder.sql` y `0008_clasificacion_lectura_publica.sql`) — quedó
así porque se crearon en paralelo desde dos sesiones distintas trabajando sobre el mismo `dev`.
Ninguno depende del otro, así que no hace falta renumerar para que funcionen, pero si en algún
momento se quiere prolijidad, conviene decidir cuál de los dos pasa a `0009` y correrlo así en
staging/producción (y en ese caso esta migración de Circuitos pasaría a ser la `0010`).
