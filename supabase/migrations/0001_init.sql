-- Solar Rooftop Lead Finder: scans and rooftops.
-- Run in the Supabase SQL editor, or with `supabase db push`.

create extension if not exists postgis;

create table if not exists scans (
  pincode text primary key check (pincode ~ '^[1-9][0-9]{5}$'),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  progress text,
  error text,
  boundary jsonb,
  boundary_source text,
  approximate boolean not null default false,
  buildings_in_boundary integer,
  rooftop_count integer,
  cost jsonb,
  duration_seconds integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists rooftops (
  pincode text not null references scans (pincode) on delete cascade,
  id text not null,
  rank integer,
  -- Areas are stored in m2 and shown in sq ft by the app.
  geometry jsonb not null,
  geom geometry (Geometry, 4326),
  centroid_lat double precision not null,
  centroid_lng double precision not null,
  footprint_area_m2 double precision,
  roof_area_m2 double precision,
  usable_area_m2 double precision,
  estimated boolean not null default false,
  imagery_quality text,
  sunshine_hours double precision,
  address text,
  state text,
  building_type text,
  -- Google place_id only. Name, phone and website are fetched on view, never stored.
  place_id text,
  place_distance_m double precision,
  kw double precision,
  units_per_year double precision,
  saving_per_year double precision,
  saving_low double precision,
  saving_high double precision,
  system_cost double precision,
  subsidy double precision,
  net_cost double precision,
  payback_years double precision,
  primary key (pincode, id)
);

create index if not exists rooftops_geom_idx on rooftops using gist (geom);
create index if not exists rooftops_rank_idx on rooftops (pincode, rank);

alter table scans enable row level security;
alter table rooftops enable row level security;

-- Public visitors may read completed scans only. Writes need the service role key,
-- which bypasses row level security and is held by the worker and the web server.
drop policy if exists "public reads completed scans" on scans;
create policy "public reads completed scans" on scans
  for select to anon, authenticated
  using (status = 'completed');

drop policy if exists "public reads rooftops of completed scans" on rooftops;
create policy "public reads rooftops of completed scans" on rooftops
  for select to anon, authenticated
  using (exists (select 1 from scans s where s.pincode = rooftops.pincode and s.status = 'completed'));
