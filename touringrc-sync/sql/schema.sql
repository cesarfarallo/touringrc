-- ============================================================
-- Schema: Plataforma Touring RC
-- Para correr en el SQL Editor de Supabase
-- ============================================================

create extension if not exists "pgcrypto"; -- para gen_random_uuid()

-- Pilotos (independiente de si están vinculados a una cuenta web)
create table pilotos (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  phonetic_name text,
  country text, -- código de 3 letras, ej 'ARG', 'URY'
  permanent_number text,
  transponder_number text,
  chassis_manufacturer text,
  registration_number text, -- id externo que le inyectamos a LiveTime
  auth_user_id uuid references auth.users(id), -- null hasta vincular
  email text, -- viene de la cuenta web, no de LiveTime
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_pilotos_nombre on pilotos (lower(first_name), lower(last_name));
create unique index idx_pilotos_registration on pilotos (registration_number) where registration_number is not null;

-- Mapea el texto crudo tal cual aparece en un reporte de LiveTime a un piloto ya resuelto
create table piloto_alias (
  id uuid primary key default gen_random_uuid(),
  texto_crudo text not null unique,
  piloto_id uuid references pilotos(id) not null,
  resuelto_manualmente boolean default false,
  creado_at timestamptz default now()
);

-- Cola de revisión para nombres ambiguos (2+ candidatos posibles)
create table alias_pendientes (
  id uuid primary key default gen_random_uuid(),
  texto_crudo text not null unique,
  candidatos uuid[] not null, -- ids de pilotos candidatos
  creado_at timestamptz default now()
);

-- Clases/categorías (recurrentes entre eventos)
create table clases (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null -- ej 'Touring Eco 1:10 Modified'
);

-- Campeonatos/torneos (temporadas)
create table campeonatos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  fecha_inicio date,
  fecha_fin date
);

-- Calendario de fechas del año
create table eventos (
  id uuid primary key default gen_random_uuid(),
  campeonato_id uuid references campeonatos(id),
  nombre text not null,
  fecha date not null,
  inscripcion_habilitada boolean default false,
  corrida boolean default false, -- true una vez que el evento ya se corrió (habilita ver resultados)
  livetime_event_id text,
  archivos jsonb default '{}', -- checklist de archivos subidos: {"pilotos": true, "resultadosFinales": true, ...}
  created_at timestamptz default now()
);

-- Inscripciones de pilotos a una fecha (hechas desde la web)
create table inscripciones (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid references eventos(id),
  piloto_id uuid references pilotos(id),
  clase_id uuid references clases(id),
  fecha_inscripcion timestamptz default now(),
  sincronizado_a_livetime boolean default false,
  unique (evento_id, piloto_id, clase_id)
);

-- Resultado final de un piloto en una clase de un evento
create table resultados_finales (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid references eventos(id),
  clase_id uuid references clases(id),
  piloto_id uuid references pilotos(id),
  posicion int,
  resultado text,
  heat text,
  tq boolean default false,
  vuelta_rapida boolean default false,
  unique (evento_id, clase_id, piloto_id)
);

-- Detalle de ronda (RoundResult / RoundTopTimes)
create table resultados_ronda (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid references eventos(id),
  clase_id uuid references clases(id),
  ronda text,
  piloto_id uuid references pilotos(id),
  posicion int,
  vueltas int,
  tiempo interval,
  fastest_lap numeric,
  avg_lap numeric,
  top5_avg numeric,
  top10_avg numeric,
  top15_avg numeric,
  top3_consecutive numeric,
  status text,
  unique (evento_id, clase_id, ronda, piloto_id)
);

-- Campeonato acumulado por clase (viene calculado de LiveTime)
create table campeonato_puntos (
  id uuid primary key default gen_random_uuid(),
  campeonato_id uuid references campeonatos(id),
  clase_id uuid references clases(id),
  piloto_id uuid references pilotos(id),
  posicion int,
  puntos int,
  puntos_sin_descartes int,
  ajuste_puntos int,
  eventos_registrados int,
  tqs int,
  wins_1ro int,
  wins_2do int,
  wins_3ro int,
  detalle_por_fecha jsonb,
  actualizado_at timestamptz default now(),
  unique (campeonato_id, clase_id, piloto_id)
);

-- ============================================================
-- Row Level Security (a ajustar según necesidad del panel admin)
-- ============================================================
alter table pilotos enable row level security;
alter table inscripciones enable row level security;
alter table eventos enable row level security;

-- Lectura pública de calendario y resultados
create policy "eventos publicos" on eventos for select using (true);
create policy "pilotos publicos" on pilotos for select using (true);

-- Un usuario logueado puede inscribirse a sí mismo (vía su piloto vinculado)
create policy "usuario se inscribe a si mismo" on inscripciones for insert
  with check (
    piloto_id in (select id from pilotos where auth_user_id = auth.uid())
  );

create policy "usuario ve sus inscripciones" on inscripciones for select
  using (
    piloto_id in (select id from pilotos where auth_user_id = auth.uid())
  );
