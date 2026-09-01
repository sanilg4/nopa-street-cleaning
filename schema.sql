-- Supabase PostgreSQL Schema for NOPA Street Cleaning Alerts

create table if not exists parking_sessions (
  id text primary key,
  segment_id text not null,
  corridor text not null,
  limits text not null,
  side text not null,
  weekday text not null,
  from_hour integer not null,
  to_hour integer not null,
  sweeping_start timestamptz not null,
  sweeping_end timestamptz not null,
  alert_time timestamptz not null,
  alert_sent boolean not null default false,
  parked_at timestamptz not null default now(),
  cleared_at timestamptz
);

-- Fast lookup index for active parking and alert checks
create index if not exists idx_parking_sessions_active 
  on parking_sessions (cleared_at, alert_sent, alert_time);

-- Disable Row Level Security (RLS) so the anon public key can read and write sessions freely
alter table parking_sessions disable row level security;
