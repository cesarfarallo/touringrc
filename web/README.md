# Touring RC — frontend

SPA en Vite + React que muestra el calendario, resultados y campeonato leyendo
directo de Supabase (sin backend propio). Ver `CLAUDE.md` en la raíz del repo
para el contexto completo del proyecto y el roadmap.

## Desarrollo local

```
npm install
cp .env.example .env.local   # completar con la URL y anon key del proyecto en Supabase
npm run dev
```

`.env.local` queda afuera de git (`*.local` en `.gitignore`). La `VITE_SUPABASE_ANON_KEY`
es pública a propósito — la protección real de los datos la da RLS en cada tabla, no el
secreto de esta clave.

## Build / deploy

```
npm run build
```

Pensado para desplegar en Vercel: conectar el repo, "Root Directory" = `web/`, framework
preset "Vite", y cargar `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` como variables de
entorno del proyecto en Vercel (Settings → Environment Variables).

## Estado (Fase A del roadmap)

- ✅ Lectura pública de `eventos`, `resultados_finales` y `campeonato_puntos`.
- ⏳ Login con Google/Apple: botón placeholder, todavía sin conectar (Fase B).
- ⏳ Inscripción online, export de inscriptos, alta de eventos desde el admin: sin
  implementar todavía (Fases C, D, E) — los botones de admin son placeholders visuales.

## Estructura

```
src/
├── lib/supabase.js      cliente de Supabase (anon key)
├── theme.js              tokens de diseño + checklist de tipos de archivo
├── hooks.js               fetch de eventos / resultados / campeonato
├── components/            piezas de UI (portadas del mockup, con datos reales)
└── App.jsx                layout + tabs (Calendario / Resultados / Campeonato)
```
