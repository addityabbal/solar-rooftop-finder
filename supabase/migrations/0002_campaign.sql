-- Phase 7: campaign layer. Panel positions, pipeline/campaign events, site-visit bookings.

alter table rooftops add column if not exists panels jsonb;

create table if not exists events (
  id bigint generated always as identity primary key,
  pincode text not null,
  roof_id text not null,
  type text not null check (type in (
    'scanned', 'solar_ready', 'visual_drawn', 'economics_calculated',
    'postcard_generated', 'mailed', 'microsite_live', 'qr_opened', 'booked')),
  source text not null default 'web' check (source in ('worker', 'web')),
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_pincode_idx on events (pincode, created_at desc);

-- Bookings are the only personal data in the system: name and phone that a person typed
-- into the booking form themselves, with an explicit consent tick.
create table if not exists bookings (
  id bigint generated always as identity primary key,
  pincode text not null,
  roof_id text not null,
  name text not null,
  phone text not null,
  consent_text text not null,
  consent_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists bookings_pincode_idx on bookings (pincode, created_at desc);

-- No public policies: only the service role (worker, web server) can read or write these.
alter table events enable row level security;
alter table bookings enable row level security;
