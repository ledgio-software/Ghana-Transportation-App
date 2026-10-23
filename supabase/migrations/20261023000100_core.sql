-- Core module: tables every phase uses (Phase 0 doc 7.2 rule 2 and 7.3).
-- Changes here are additive only: new tables or nullable columns, never renames or drops.
-- Conventions: uuid ids, money as integer pesewas, timestamptz in UTC.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accounts, roles, devices and consent
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('admin', 'data_editor', 'moderator');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  preferred_language text not null default 'en' check (preferred_language ~ '^[a-z]{2,3}$'),
  home_city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Core. One row per auth user; created automatically on sign-up.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
comment on table public.user_roles is 'Core. Staff roles for the admin dashboard. Passengers have no rows here.';

-- Staff powers only apply to sessions that passed two-factor (ADR 0006), so a stolen
-- staff password alone cannot change fares.
create or replace function public.has_staff_aal()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function public.has_role(check_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_staff_aal() and exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = check_role
  );
$$;

create or replace function public.can_edit_reference_data()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_staff_aal() and exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('admin', 'data_editor')
  );
$$;

create or replace function public.can_moderate()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_staff_aal() and exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('admin', 'moderator')
  );
$$;

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  installation_id uuid not null,
  platform text not null check (platform in ('android', 'ios', 'web')),
  app_version text not null,
  os_version text,
  push_token text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, installation_id)
);
comment on table public.devices is 'Core. App installations of signed-in users, for push and consent records.';

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_type text not null check (
    consent_type in ('terms', 'privacy', 'location', 'share_with_contacts', 'marketing')
  ),
  document_version text not null,
  granted boolean not null,
  app_version text,
  device_id uuid references public.devices (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.consents is
  'Core. Append-only consent history (Act 843). The latest row per type is the current state.';
create index consents_user_type_idx on public.consents (user_id, consent_type, created_at desc);

-- ---------------------------------------------------------------------------
-- Places, stations, operators and routes
-- ---------------------------------------------------------------------------

create type public.operator_kind as enum (
  'intercity_bus', 'trotro_union', 'shared_taxi', 'ride_hailing', 'airline', 'other'
);

create table public.operators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  kind public.operator_kind not null,
  website text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicle_types (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  sort_order smallint not null default 100
);
comment on table public.vehicle_types is 'Core. trotro, shared_taxi, bus, ride_hailing, flight, ...';

create table public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('city', 'town', 'landmark', 'junction')),
  region text,
  location extensions.geography(Point, 4326) not null,
  ghanapost_gps text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index places_location_idx on public.places using gist (location);

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  kind text not null default 'lorry_station'
    check (kind in ('lorry_station', 'bus_terminal', 'airport', 'stop')),
  place_id uuid references public.places (id) on delete set null,
  operator_id uuid references public.operators (id) on delete set null,
  city text not null,
  region text,
  location extensions.geography(Point, 4326) not null,
  ghanapost_gps text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.stations.name is 'Canonical spelling from the agreed list, e.g. "Kwame Nkrumah Circle".';
create index stations_location_idx on public.stations using gist (location);
create index stations_city_idx on public.stations (city) where is_active;

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  origin_station_id uuid not null references public.stations (id),
  destination_station_id uuid not null references public.stations (id),
  kind text not null check (kind in ('intercity', 'intracity')),
  corridor text,
  distance_m integer check (distance_m > 0),
  typical_duration_min integer check (typical_duration_min > 0),
  path extensions.geography(LineString, 4326),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (origin_station_id <> destination_station_id),
  unique (origin_station_id, destination_station_id, kind)
);
comment on column public.routes.corridor is 'Highway corridor, e.g. N6 (Accra-Kumasi). Adding N1/N10 is data, not code.';
create index routes_destination_idx on public.routes (destination_station_id);

create table public.route_stops (
  route_id uuid not null references public.routes (id) on delete cascade,
  seq smallint not null check (seq > 0),
  station_id uuid not null references public.stations (id),
  distance_from_origin_m integer,
  primary key (route_id, seq)
);
comment on table public.route_stops is 'Core. Legal intermediate stops, used to spot short dropping.';

-- ---------------------------------------------------------------------------
-- Notifications, audit, feature switches, app versions, translations
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
comment on table public.audit_log is 'Core. Written only by triggers on staff-editable tables.';
create index audit_log_record_idx on public.audit_log (table_name, record_id, created_at desc);

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (actor_id, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'key', rec ->> 'code', rec ->> 'platform'),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

create table public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_.]+$'),
  description text not null,
  enabled boolean not null default false,
  rollout_percent smallint not null default 0 check (rollout_percent between 0 and 100),
  cities text[] not null default '{}',
  updated_at timestamptz not null default now()
);
comment on table public.feature_flags is
  'Core. Every unreleased feature ships behind a switch (rule 6). Empty cities = all cities.';

create table public.app_versions (
  platform text primary key check (platform in ('android', 'ios', 'web')),
  min_supported text not null check (min_supported ~ '^\d+\.\d+\.\d+$'),
  latest text not null check (latest ~ '^\d+\.\d+\.\d+$'),
  update_url text,
  updated_at timestamptz not null default now()
);
comment on table public.app_versions is 'Core. The app checks this on start and forces an update below min_supported.';

create table public.translations (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  field text not null,
  language text not null check (language ~ '^[a-z]{2,3}$'),
  value text not null,
  updated_at timestamptz not null default now(),
  unique (table_name, record_id, field, language)
);
comment on table public.translations is
  'Core. Translated database content (e.g. station names in Twi). UI strings live in packages/shared.';

-- updated_at triggers
create trigger operators_set_updated_at before update on public.operators
  for each row execute function public.set_updated_at();
create trigger places_set_updated_at before update on public.places
  for each row execute function public.set_updated_at();
create trigger stations_set_updated_at before update on public.stations
  for each row execute function public.set_updated_at();
create trigger routes_set_updated_at before update on public.routes
  for each row execute function public.set_updated_at();
create trigger feature_flags_set_updated_at before update on public.feature_flags
  for each row execute function public.set_updated_at();
create trigger app_versions_set_updated_at before update on public.app_versions
  for each row execute function public.set_updated_at();
create trigger translations_set_updated_at before update on public.translations
  for each row execute function public.set_updated_at();

-- audit triggers on staff-editable tables
create trigger operators_audit after insert or update or delete on public.operators
  for each row execute function public.audit_row();
create trigger stations_audit after insert or update or delete on public.stations
  for each row execute function public.audit_row();
create trigger routes_audit after insert or update or delete on public.routes
  for each row execute function public.audit_row();
create trigger feature_flags_audit after insert or update or delete on public.feature_flags
  for each row execute function public.audit_row();
create trigger app_versions_audit after insert or update or delete on public.app_versions
  for each row execute function public.audit_row();
create trigger user_roles_audit after insert or update or delete on public.user_roles
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.devices enable row level security;
alter table public.consents enable row level security;
alter table public.operators enable row level security;
alter table public.vehicle_types enable row level security;
alter table public.places enable row level security;
alter table public.stations enable row level security;
alter table public.routes enable row level security;
alter table public.route_stops enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;
alter table public.feature_flags enable row level security;
alter table public.app_versions enable row level security;
alter table public.translations enable row level security;

-- Own rows
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "user_roles: read own" on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()) or public.has_role('admin'));
create policy "user_roles: admins manage" on public.user_roles
  for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "devices: manage own" on public.devices
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Consent is append-only: users may read and add rows, never edit or delete them.
create policy "consents: read own" on public.consents
  for select to authenticated using (user_id = (select auth.uid()));
create policy "consents: add own" on public.consents
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "notifications: read own" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications: mark own read" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "audit_log: admins read" on public.audit_log
  for select to authenticated using (public.has_role('admin'));

-- Reference data: anyone (including signed-out users) reads; staff edit.
create policy "operators: public read" on public.operators for select to anon, authenticated using (true);
create policy "operators: staff write" on public.operators for all to authenticated
  using (public.can_edit_reference_data()) with check (public.can_edit_reference_data());

create policy "vehicle_types: public read" on public.vehicle_types for select to anon, authenticated using (true);
create policy "vehicle_types: staff write" on public.vehicle_types for all to authenticated
  using (public.can_edit_reference_data()) with check (public.can_edit_reference_data());

create policy "places: public read" on public.places for select to anon, authenticated using (true);
create policy "places: staff write" on public.places for all to authenticated
  using (public.can_edit_reference_data()) with check (public.can_edit_reference_data());

create policy "stations: public read" on public.stations for select to anon, authenticated using (true);
create policy "stations: staff write" on public.stations for all to authenticated
  using (public.can_edit_reference_data()) with check (public.can_edit_reference_data());

create policy "routes: public read" on public.routes for select to anon, authenticated using (true);
create policy "routes: staff write" on public.routes for all to authenticated
  using (public.can_edit_reference_data()) with check (public.can_edit_reference_data());

create policy "route_stops: public read" on public.route_stops for select to anon, authenticated using (true);
create policy "route_stops: staff write" on public.route_stops for all to authenticated
  using (public.can_edit_reference_data()) with check (public.can_edit_reference_data());

create policy "translations: public read" on public.translations for select to anon, authenticated using (true);
create policy "translations: staff write" on public.translations for all to authenticated
  using (public.can_edit_reference_data()) with check (public.can_edit_reference_data());

create policy "feature_flags: public read" on public.feature_flags for select to anon, authenticated using (true);
create policy "feature_flags: admins write" on public.feature_flags for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "app_versions: public read" on public.app_versions for select to anon, authenticated using (true);
create policy "app_versions: admins write" on public.app_versions for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
