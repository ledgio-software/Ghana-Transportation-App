-- Phase 1 (Data): fare directory, crowd reports, trips, weather, hazard radar.
-- Phase 2 to 4 tables (safety_circles, bookings, station_queues, ...) are reserved
-- names in docs/architecture.md and must not be reused here.

-- ---------------------------------------------------------------------------
-- Fares
-- ---------------------------------------------------------------------------

create type public.fare_source_kind as enum (
  'official_gprtu', 'operator_list', 'station_board', 'passenger_report', 'field_ridden', 'admin'
);

create table public.fare_sources (
  id uuid primary key default gen_random_uuid(),
  kind public.fare_source_kind not null,
  name text not null,
  reference_url text,
  document_date date,
  notes text,
  created_at timestamptz not null default now()
);
comment on table public.fare_sources is 'Phase 1. Where a fare came from, e.g. "GPRTU Greater Accra schedule, June 2026".';

create table public.fares (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id),
  operator_id uuid references public.operators (id),
  vehicle_type text not null references public.vehicle_types (code),
  class text not null default 'standard' check (class ~ '^[a-z_]+$'),
  amount_pesewas integer not null check (amount_pesewas > 0),
  currency char(3) not null default 'GHS',
  is_official boolean not null default false,
  source_id uuid references public.fare_sources (id),
  effective_from date not null default current_date,
  effective_to date,
  last_confirmed_at timestamptz not null default now(),
  departure_mode text not null default 'unknown'
    check (departure_mode in ('fill_and_go', 'scheduled', 'unknown')),
  first_departure time,
  last_departure time,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
comment on table public.fares is
  'Phase 1. Fare history: the current fare has effective_to null. A change closes the old row and adds a new one.';
create unique index fares_one_current_idx
  on public.fares (route_id, operator_id, vehicle_type, class) nulls not distinct
  where effective_to is null;
create index fares_route_idx on public.fares (route_id) where effective_to is null;

create trigger fares_set_updated_at before update on public.fares
  for each row execute function public.set_updated_at();
create trigger fares_audit after insert or update or delete on public.fares
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Crowd reports (written from the phone's offline outbox, so client_id makes retries idempotent)
-- ---------------------------------------------------------------------------

create table public.fare_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  route_id uuid not null references public.routes (id),
  operator_id uuid references public.operators (id),
  vehicle_type text not null references public.vehicle_types (code),
  class text not null default 'standard',
  amount_pesewas integer not null check (amount_pesewas > 0 and amount_pesewas < 10000000),
  travelled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  moderated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on column public.fare_reports.user_id is 'Set to null after 90 days (retention job).';
create index fare_reports_route_recent_idx on public.fare_reports (route_id, travelled_at desc);
create index fare_reports_user_idx on public.fare_reports (user_id, created_at desc);

create table public.overcharge_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  route_id uuid not null references public.routes (id),
  fare_id uuid references public.fares (id),
  kind text not null check (kind in ('overcharge', 'short_drop')),
  quoted_pesewas integer not null check (quoted_pesewas > 0),
  reference_pesewas integer,
  vehicle_plate text,
  occurred_at timestamptz not null,
  location extensions.geography(Point, 4326),
  note text check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  moderated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index overcharge_reports_route_idx on public.overcharge_reports (route_id, occurred_at desc);

-- Report limits against fake prices (PRD: "report limits, trust scores, flagging").
create or replace function public.enforce_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  if new.user_id is null then
    raise exception 'reports require a signed-in user' using errcode = '42501';
  end if;
  execute format(
    'select count(*) from public.%I where user_id = $1 and created_at > now() - interval ''1 hour''',
    tg_table_name
  ) into recent using new.user_id;
  if recent >= 20 then
    raise exception 'too many reports, try again later' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger fare_reports_rate_limit before insert on public.fare_reports
  for each row execute function public.enforce_report_rate_limit();
create trigger overcharge_reports_rate_limit before insert on public.overcharge_reports
  for each row execute function public.enforce_report_rate_limit();

-- ---------------------------------------------------------------------------
-- Trips, saved routes, weather
-- ---------------------------------------------------------------------------

create table public.saved_routes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  route_id uuid not null references public.routes (id) on delete cascade,
  notify_fare_changes boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, route_id)
);

create table public.trips_planned (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users (id) on delete cascade,
  origin_station_id uuid not null references public.stations (id),
  destination_station_id uuid not null references public.stations (id),
  route_id uuid references public.routes (id),
  planned_departure_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.trips_planned is 'Phase 1. Trip summaries; kept 12 months (retention job).';

create table public.weather_snapshots (
  id uuid primary key default gen_random_uuid(),
  location extensions.geography(Point, 4326) not null,
  forecast_for timestamptz not null,
  provider text not null,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);
comment on table public.weather_snapshots is 'Phase 1. Cache of provider forecasts, written by edge functions only.';
create index weather_snapshots_lookup_idx on public.weather_snapshots using gist (location);
create index weather_snapshots_time_idx on public.weather_snapshots (forecast_for);

-- ---------------------------------------------------------------------------
-- Hazard radar (N6 first; more corridors are data)
-- ---------------------------------------------------------------------------

create table public.hazard_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  corridor text not null,
  kind text not null check (kind in ('crash_hotspot', 'road_works', 'flooding', 'checkpoint', 'other')),
  geom extensions.geography(Geometry, 4326) not null,
  alert_radius_m integer not null default 1000 check (alert_radius_m between 100 and 10000),
  severity smallint not null default 2 check (severity between 1 and 3),
  audio_key text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hazard_zones_geom_idx on public.hazard_zones using gist (geom);

create trigger hazard_zones_set_updated_at before update on public.hazard_zones
  for each row execute function public.set_updated_at();
create trigger hazard_zones_audit after insert or update or delete on public.hazard_zones
  for each row execute function public.audit_row();

create table public.hazard_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  hazard_zone_id uuid references public.hazard_zones (id) on delete set null,
  kind text not null check (kind in ('crash', 'closure', 'road_works', 'flooding', 'checkpoint', 'other')),
  location extensions.geography(Point, 4326) not null,
  note text check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  moderated_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '6 hours',
  created_at timestamptz not null default now()
);
create index hazard_reports_location_idx on public.hazard_reports using gist (location);

create trigger hazard_reports_rate_limit before insert on public.hazard_reports
  for each row execute function public.enforce_report_rate_limit();

create table public.diversions (
  id uuid primary key default gen_random_uuid(),
  hazard_zone_id uuid not null references public.hazard_zones (id) on delete cascade,
  name text not null,
  description text,
  path extensions.geography(LineString, 4326),
  is_active boolean not null default true,
  last_tested_at date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Read API
-- ---------------------------------------------------------------------------

-- Every option between two stations with the three numbers the PRD asks for:
-- official fare, what people paid this week (median of non-rejected reports) and last confirmed date.
create or replace function public.search_fares(origin uuid, destination uuid)
returns table (
  fare_id uuid,
  route_id uuid,
  route_kind text,
  operator_id uuid,
  operator_name text,
  vehicle_type text,
  vehicle_type_name text,
  class text,
  official_pesewas integer,
  reported_median_pesewas integer,
  report_count integer,
  last_confirmed_at timestamptz,
  departure_mode text,
  first_departure time,
  last_departure time,
  typical_duration_min integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    f.id,
    r.id,
    r.kind,
    o.id,
    o.name,
    f.vehicle_type,
    vt.name,
    f.class,
    case when f.is_official then f.amount_pesewas end,
    rep.median_pesewas,
    coalesce(rep.n, 0)::integer,
    f.last_confirmed_at,
    f.departure_mode,
    f.first_departure,
    f.last_departure,
    r.typical_duration_min
  from public.routes r
  join public.fares f on f.route_id = r.id and f.effective_to is null
  join public.vehicle_types vt on vt.code = f.vehicle_type
  left join public.operators o on o.id = f.operator_id
  left join lateral (
    select
      round(percentile_cont(0.5) within group (order by fr.amount_pesewas))::integer as median_pesewas,
      count(*) as n
    from public.fare_reports fr
    where fr.route_id = r.id
      and fr.vehicle_type = f.vehicle_type
      and fr.class = f.class
      and fr.operator_id is not distinct from f.operator_id
      and fr.status <> 'rejected'
      and fr.travelled_at > now() - interval '7 days'
  ) rep on true
  where r.origin_station_id = search_fares.origin
    and r.destination_station_id = search_fares.destination
    and r.is_active
  order by coalesce(case when f.is_official then f.amount_pesewas end, rep.median_pesewas, f.amount_pesewas), vt.sort_order;
$$;

grant execute on function public.search_fares(uuid, uuid) to anon, authenticated;

-- A fare change keeps history: the current row is closed and a new current row is added.
-- Runs with the caller's rights, so only staff (via row level security) can use it.
create or replace function public.change_fare(
  p_fare_id uuid,
  p_amount_pesewas integer,
  p_source_id uuid default null,
  p_effective_from date default current_date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_fare public.fares;
  new_id uuid;
begin
  update public.fares
     set effective_to = p_effective_from
   where id = p_fare_id and effective_to is null
  returning * into old_fare;
  if not found then
    raise exception 'fare % not found, already replaced, or not editable', p_fare_id using errcode = 'P0002';
  end if;

  insert into public.fares (
    route_id, operator_id, vehicle_type, class, amount_pesewas, currency, is_official, source_id,
    effective_from, last_confirmed_at, departure_mode, first_departure, last_departure, notes
  ) values (
    old_fare.route_id, old_fare.operator_id, old_fare.vehicle_type, old_fare.class, p_amount_pesewas,
    old_fare.currency, old_fare.is_official, coalesce(p_source_id, old_fare.source_id),
    p_effective_from, now(), old_fare.departure_mode, old_fare.first_departure, old_fare.last_departure,
    old_fare.notes
  ) returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.change_fare(uuid, integer, uuid, date) from public, anon;
grant execute on function public.change_fare(uuid, integer, uuid, date) to authenticated;

-- Accepted, unexpired hazard reports for every traveller on the corridor, without reporter identity.
create or replace function public.live_hazard_reports()
returns table (
  id uuid,
  hazard_zone_id uuid,
  kind text,
  longitude double precision,
  latitude double precision,
  note text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.hazard_zone_id, h.kind,
         extensions.st_x(h.location::extensions.geometry),
         extensions.st_y(h.location::extensions.geometry),
         h.note, h.created_at, h.expires_at
  from public.hazard_reports h
  where h.status = 'accepted' and h.expires_at > now()
  order by h.created_at desc;
$$;

grant execute on function public.live_hazard_reports() to anon, authenticated;

-- "Download my data" (Act 843 rights, P1-LEGAL).
create or replace function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'consents', coalesce((select jsonb_agg(c order by c.created_at) from public.consents c where c.user_id = auth.uid()), '[]'),
    'devices', coalesce((select jsonb_agg(d) from public.devices d where d.user_id = auth.uid()), '[]'),
    'saved_routes', coalesce((select jsonb_agg(s) from public.saved_routes s where s.user_id = auth.uid()), '[]'),
    'trips_planned', coalesce((select jsonb_agg(t) from public.trips_planned t where t.user_id = auth.uid()), '[]'),
    'fare_reports', coalesce((select jsonb_agg(f) from public.fare_reports f where f.user_id = auth.uid()), '[]'),
    'overcharge_reports', coalesce((select jsonb_agg(o) from public.overcharge_reports o where o.user_id = auth.uid()), '[]'),
    'hazard_reports', coalesce((select jsonb_agg(h) from public.hazard_reports h where h.user_id = auth.uid()), '[]')
  );
$$;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.fare_sources enable row level security;
alter table public.fares enable row level security;
alter table public.fare_reports enable row level security;
alter table public.overcharge_reports enable row level security;
alter table public.saved_routes enable row level security;
alter table public.trips_planned enable row level security;
alter table public.weather_snapshots enable row level security;
alter table public.hazard_zones enable row level security;
alter table public.hazard_reports enable row level security;
alter table public.diversions enable row level security;

create policy "fare_sources: public read" on public.fare_sources for select to anon, authenticated using (true);
create policy "fare_sources: staff write" on public.fare_sources for all to authenticated
  using (public.can_edit_reference_data()) with check (public.can_edit_reference_data());

create policy "fares: public read" on public.fares for select to anon, authenticated using (true);
create policy "fares: staff write" on public.fares for all to authenticated
  using (public.can_edit_reference_data()) with check (public.can_edit_reference_data());

create policy "hazard_zones: public read" on public.hazard_zones for select to anon, authenticated using (true);
create policy "hazard_zones: staff write" on public.hazard_zones for all to authenticated
  using (public.can_edit_reference_data()) with check (public.can_edit_reference_data());

create policy "diversions: public read" on public.diversions for select to anon, authenticated using (true);
create policy "diversions: staff write" on public.diversions for all to authenticated
  using (public.can_edit_reference_data()) with check (public.can_edit_reference_data());

create policy "weather_snapshots: public read" on public.weather_snapshots for select to anon, authenticated using (true);

-- Reports: users add and read their own; moderators read and moderate all.
create policy "fare_reports: add own" on public.fare_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy "fare_reports: read own or moderate" on public.fare_reports for select to authenticated
  using (user_id = (select auth.uid()) or public.can_moderate());
create policy "fare_reports: moderators update" on public.fare_reports for update to authenticated
  using (public.can_moderate()) with check (public.can_moderate());

create policy "overcharge_reports: add own" on public.overcharge_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy "overcharge_reports: read own or moderate" on public.overcharge_reports for select to authenticated
  using (user_id = (select auth.uid()) or public.can_moderate());
create policy "overcharge_reports: moderators update" on public.overcharge_reports for update to authenticated
  using (public.can_moderate()) with check (public.can_moderate());

-- Other people's hazard reports are only visible through live_hazard_reports(), which hides who reported them.
create policy "hazard_reports: add own" on public.hazard_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy "hazard_reports: read own or moderate" on public.hazard_reports for select to authenticated
  using (user_id = (select auth.uid()) or public.can_moderate());
create policy "hazard_reports: moderators update" on public.hazard_reports for update to authenticated
  using (public.can_moderate()) with check (public.can_moderate());

create policy "saved_routes: manage own" on public.saved_routes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "trips_planned: manage own" on public.trips_planned for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
