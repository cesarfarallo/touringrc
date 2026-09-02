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
| `clases` | Categorías recurrentes entre eventos (ej. `Touring Eco 1:10 Modified`). | sin RLS |
| `campeonatos` | Temporada/torneo (nombre, fecha_inicio, fecha_fin). | sin RLS |
| `eventos` | Calendario: una fila por fecha. `inscripcion_habilitada` (bool, **sin uso desde la migración 0007** — reemplazado por la ventana calculada), `inscripcion_dias_antes` (int, migración 0007: cuántos días antes de `fecha` se habilita la inscripción online para *esa* fecha en particular — nullable, cada evento configura el suyo), `corrida` (bool, habilita ver resultados), `archivos` (jsonb checklist de qué se subió: `{"resultadosFinales": true, ...}`). | select público, insert/update solo admin (migración 0004) |
| `inscripciones` | Inscripción de un piloto a una fecha/clase, hecha desde la web. `sincronizado_a_livetime` marca si ya se exportó hacia Live Timing. Unique `(evento_id, piloto_id, clase_id)`. | insert/select solo del propio piloto vía `auth.uid()` |
| `resultados_finales` | Resultado final de un piloto en una clase de un evento (posición, resultado crudo, heat, `tq`, `vuelta_rapida`). Unique `(evento_id, clase_id, piloto_id)`. | sin RLS |
| `resultados_ronda` | Detalle por ronda/heat (laps, tiempos, promedios). Unique `(evento_id, clase_id, ronda, piloto_id)`. **Ojo**: la columna `tiempo interval` existe pero `sync_evento.py` no la completa hoy (solo llena `vueltas`). | sin RLS |
| `clasificacion` | Posición de largada (migración 0006): resumen de las rondas clasificatorias que exporta Live Timing en `Leaderboard-Event*.xls` (mejor resultado combinado, ej. "mejores 2 de 3", `rondas` jsonb con el detalle crudo de cada ronda, `tie_breaker` con el criterio de desempate). Distinta de `resultados_finales`, que es el resultado de la final en sí. Unique `(evento_id, clase_id, piloto_id)`. | sin RLS |
| `campeonato_puntos` | Acumulado de campeonato por clase/piloto (puntos, TQs, victorias, `detalle_por_fecha` jsonb). Unique `(campeonato_id, clase_id, piloto_id)`. | sin RLS |
| `admins` | Lista de emails autorizados como admin (migración 0002). Reemplaza el viejo toggle "ADMIN" puramente visual del frontend por una verificación real del lado del servidor. | select propio (un admin se ve a sí mismo) |
| `vinculos_pendientes` | Cola de revisión (migración 0002): logins que no matchearon 1 a 1 contra el roster de `pilotos` ya cargado — o crearon un piloto nuevo (0 candidatos) o quedaron ambiguos (2+ candidatos con mismo nombre). El admin confirma o fusiona vía `fusionar_pilotos()`. | select/update solo admin |

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
- **Fusionar** con uno de los candidatos ambiguos, si los hay — llama a la función Postgres
  `fusionar_pilotos(duplicado, correcto)` (`security definer`, valida `es_admin()` internamente),
  que reasigna todo el historial (`resultados_finales`, `resultados_ronda`,
  `campeonato_puntos`, `inscripciones`, `piloto_alias`) del piloto duplicado al correcto, y
  borra el duplicado. Como el piloto duplicado se acaba de crear en el login, en la práctica
  nunca tiene historial propio que reasignar — es una fusión segura.

⚠️ Antes de correr la migración 0002 en cualquier proyecto, hay que editar el `INSERT` de la
sección 1 del archivo y poner el email real que va a ser admin (reemplazar
`'TU_EMAIL_AQUI@gmail.com'`).

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
  secuencia** (no en paralelo) a la Edge Function `subir-resultado` — secuencial a propósito,
  porque `marcarArchivo()` del lado de la función hace un read-modify-write sobre
  `eventos.archivos` y dos uploads simultáneos para el mismo evento se pisarían el checklist
  entre sí. Muestra el resultado de cada archivo por separado (✓/✗ con el nombre) y al final
  refresca el checklist una sola vez. Si algún archivo es `SeriesResultReport.xls` (tipo
  `campeonato`), primero resuelve el `campeonato_id` vigente (el de `fecha_inicio` más
  reciente, mismo criterio que `useCampeonato()`) antes de mandarlo.
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
- **`piloto_resolver.ts`**: port de `piloto_resolver.py` (`PilotoResolver`), misma lógica de
  resolución de identidad (alias exacto → candidatos por nombre/apellido → 1 = linkea, 0 =
  crea piloto nuevo, 2+ = encola en `alias_pendientes`), pero contra el cliente JS de
  Supabase en vez de la librería Python.
- **`index.ts`**: el handler (`Deno.serve`). Contrato: `POST` con body JSON
  `{ eventoId, tipo, contenidoBase64, campeonatoId? }`, donde `tipo` es uno de
  `"resultadosFinales"` (`FinalResults.xls`), `"detalleRondas"` (`RoundResult-*.xls`),
  `"vueltaRapida"` (`RoundTopTimes-*.xls`), `"clasificacion"` (`Leaderboard-Event*.xls`,
  posición de largada — ver tabla `clasificacion`, migración 0006) o `"campeonato"`
  (`SeriesResultReport.xls`, requiere `campeonatoId`). **No** incluye `GenericImport.csv`: ese
  archivo es al revés, algo que la web tiene que *generar* (Fase D, botón "Exportar
  inscriptos"), nunca algo que el admin sube — sacado del checklist y del Edge Function
  después de confundirlo con un archivo de subida en una prueba real. Verifica el JWT del
  `Authorization: Bearer` header contra Supabase Auth, chequea que el piloto vinculado a esa
  sesión tenga el rol `admin` en `piloto_roles` (mismo criterio que `es_admin()` del lado de
  Postgres, pero reimplementado acá porque una Edge Function no corre dentro de una policy de
  RLS), y recién ahí despacha a `syncFinalResults`/`syncRoundResults`/`syncTopTimes`/
  `syncClasificacion`/`syncCampeonato` — los primeros cuatro son ports directos de las
  funciones homónimas de `sync_evento.py` (`syncClasificacion` es nuevo, no existe en el CLI
  de Python todavía — pendiente si se necesita paridad ahí), mismo
  orden y misma lógica de upsert. Al final llama `marcarArchivo()` (equivalente a
  `marcar_archivo()` en Python) para actualizar el jsonb `archivos` de `eventos`, que es lo
  que lee `ArchivosChecklist`. Devuelve `{ ok: true, resumen }` o `{ error }`.

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
  fecha" (el botón queda deshabilitado).
- **Botón "Inscribirme"** (`EventoCard.jsx`, Calendario público): visible solo logueado y
  dentro de la ventana. `useInscripcionPiloto(eventoId, pilotoId)` (`hooks.js`) chequea si el
  piloto ya tiene una inscripción para ese evento — si la tiene, muestra la clase en vez del
  botón (no se soporta anotarse a más de una clase por evento desde la UI, aunque el modelo de
  datos lo permitiría). Si no, un formulario inline con un `<select>` de clases
  (`useClases()`) inserta en `inscripciones` — la policy RLS de insert/select ya existía
  (`piloto_id in (select id from pilotos where auth_user_id = auth.uid())`, ver
  `schema.sql`), no hizo falta ninguna migración de permisos nueva.
- **Export de inscriptos** (`web/src/lib/genericImport.js` + botón "Exportar inscriptos" en
  `GestionEventos.jsx`): arma el `GenericImport.csv` real (56 columnas, header tomado tal cual
  de `touringrc-sync/files/GenericImport.csv`) a partir de `inscripciones` del evento, join con
  `pilotos` y `clases` — completa `FirstName`/`LastName`/`ClassName`/`Email`/
  `RegistrationNumber`/`PermanentNumber`/`TransponderNumber`, el resto de las columnas queda
  vacío (Live Timing las tolera). Descarga el archivo directo en el navegador (`Blob` +
  `<a download>`), sin pasar por ningún backend — es una lectura pública de datos que ya son
  del propio club, no hizo falta una Edge Function para esto. El admin lo importa a mano en
  Live Timing (no hay API para automatizar ese lado).

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

El nombre visible del producto es **"Touring Eco 1:10 Argentina"** — distinto del nombre del
repo/proyecto interno ("Touring RC", usado en este documento y en el código como
identificador). Vive **solo** en el `<title>` de `web/index.html` (la pestaña del navegador,
marcadores, historial) — el header de la web (`App.jsx`) no repite el nombre como texto, va
directo al logo, sin wordmark al lado (decisión explícita: "en el home solo el logo"). En
entornos de desarrollo (`npm run dev` local o Preview de Vercel con `VITE_APP_ENV=staging`),
ese título de pestaña suma además el sufijo `" (DEV)"` (seteado con `document.title` en un
`useEffect` de `App.jsx`, mismo criterio `ES_DEV` que usa `DevRibbon.jsx`) — la franja roja
diagonal ya cubre el aviso visual dentro de la página, esto es un aviso adicional visible en
el título de la pestaña/marcadores/historial. El logo real de la categoría (auto + wordmark
"touring RC", PNG con transparencia) vive en `web/public/logo.png` y se muestra en el header
vía `<img src="/logo.png">` a 44px de alto — reemplaza el ícono `Flag` placeholder que hubo
mientras se conseguía el archivo (el que se compartió por el chat en un mensaje llegó como
imagen pegada, sin quedar accesible como archivo en este entorno; el admin lo subió
directo a `dev` por su cuenta).

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
