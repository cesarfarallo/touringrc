# Migraciones de schema

`../schema.sql` y `../seed.sql` son el **baseline**: el estado inicial de la base, ya aplicado
tal cual en el proyecto de producción de Supabase (y el que hay que aplicar tal cual al armar
cualquier proyecto nuevo, ej. staging). No se editan retroactivamente.

De acá en adelante, **todo cambio de schema** (tabla nueva, columna nueva, cambio de RLS, etc.)
se agrega acá como un archivo `.sql` numerado, en vez de editar `schema.sql` directamente:

```
0001_descripcion_corta.sql
0002_otra_descripcion.sql
...
```

Cada archivo:
- Arranca con un comentario explicando **qué cambia y por qué** (no hace falta que sea largo).
- Contiene SQL idempotente cuando sea posible (`create table if not exists`,
  `alter table ... add column if not exists`, etc.) para poder re-correrlo sin drama si algo
  falla a mitad de camino.
- Se prueba primero en el proyecto de **staging**, y recién después de confirmar que anda se
  corre el mismo archivo, sin tocarlo, en **producción**.

## Cómo aplicar un archivo nuevo

1. Abrí el SQL Editor del proyecto de Supabase correspondiente (staging o prod).
2. Pegá el contenido completo del archivo `NNNN_descripcion.sql`.
3. Ejecutalo. Revisá que no haya errores.
4. Repetí el mismo archivo, sin cambios, en el otro proyecto cuando corresponda.

No hay todavía automatización (Supabase CLI / `supabase db push`) — es manual a propósito,
ver Fase F del roadmap en `CLAUDE.md` si en algún momento conviene sumar eso.
