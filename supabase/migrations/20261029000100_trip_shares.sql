-- P1-SAFE-05 "Share my trip": the traveller sends family a link, and the family page shows where
-- they are until they arrive (ADR 0015).
--
-- No sign-in needed and no account linked: a share is a random link id (public, in the link)
-- plus a secret only the traveller's phone holds (needed to move the dot or stop sharing).
-- Only the latest position is kept, never a history. Stopping clears it, a share ends by itself
-- after 6 hours, and the row is deleted a day after that.

create table public.trip_shares (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null,
  origin_station_id uuid not null references public.stations (id),
  destination_station_id uuid not null references public.stations (id),
  latitude double precision,
  longitude double precision,
  located_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours',
  ended_at timestamptz
);

-- No policies and no grants: the table is reached only through the functions below.
alter table public.trip_shares enable row level security;
revoke all on public.trip_shares from public, anon, authenticated;

create index trip_shares_expires_at_idx on public.trip_shares (expires_at);

create or replace function public.trip_share_hash(p_secret text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
$$;

revoke execute on function public.trip_share_hash(text) from public, anon, authenticated;

-- Starts sharing a trip between two stations. Returns the link id and the phone's secret.
create or replace function public.start_trip_share(p_origin uuid, p_destination uuid)
returns table (share_id uuid, secret text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_row public.trip_shares;
begin
  if not exists (select 1 from public.stations where id = p_origin and is_active)
     or not exists (select 1 from public.stations where id = p_destination and is_active) then
    raise exception 'unknown station' using errcode = '22023';
  end if;
  insert into public.trip_shares (secret_hash, origin_station_id, destination_station_id)
  values (public.trip_share_hash(v_secret), p_origin, p_destination)
  returning * into v_row;
  return query select v_row.id, v_secret, v_row.expires_at;
end;
$$;

-- Moves the dot. Only the phone that started the share can, and only while it is live.
create or replace function public.update_trip_share(p_id uuid, p_secret text, p_latitude double precision, p_longitude double precision)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Ghana only, like the rest of the app.
  if not (p_latitude between 4.5 and 11.5 and p_longitude between -3.5 and 1.5) then
    raise exception 'position outside Ghana' using errcode = '22023';
  end if;
  update public.trip_shares
  set latitude = p_latitude, longitude = p_longitude, located_at = now()
  where id = p_id
    and secret_hash = public.trip_share_hash(p_secret)
    and ended_at is null
    and expires_at > now();
  return found;
end;
$$;

-- Stops sharing and forgets the position straight away.
create or replace function public.end_trip_share(p_id uuid, p_secret text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.trip_shares
  set ended_at = coalesce(ended_at, now()), latitude = null, longitude = null, located_at = null
  where id = p_id and secret_hash = public.trip_share_hash(p_secret);
  return found;
end;
$$;

-- What the family page shows. The position only while the share is live.
create or replace function public.get_trip_share(p_id uuid)
returns table (
  origin_name text,
  origin_latitude double precision,
  origin_longitude double precision,
  destination_name text,
  destination_latitude double precision,
  destination_longitude double precision,
  latitude double precision,
  longitude double precision,
  located_at timestamptz,
  expires_at timestamptz,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.name, o.latitude, o.longitude,
    d.name, d.latitude, d.longitude,
    case when live then s.latitude end,
    case when live then s.longitude end,
    case when live then s.located_at end,
    s.expires_at,
    case when s.ended_at is not null then 'ended' when not live then 'expired' else 'live' end
  from public.trip_shares s
  join public.stations o on o.id = s.origin_station_id
  join public.stations d on d.id = s.destination_station_id
  cross join lateral (select s.ended_at is null and s.expires_at > now() as live) l
  where s.id = p_id;
$$;

grant execute on function public.start_trip_share(uuid, uuid) to anon, authenticated;
grant execute on function public.update_trip_share(uuid, text, double precision, double precision) to anon, authenticated;
grant execute on function public.end_trip_share(uuid, text) to anon, authenticated;
grant execute on function public.get_trip_share(uuid) to anon, authenticated;

-- Retention: trip shares are deleted a day after they expire.
create or replace function public.purge_expired_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb := '{}'::jsonb;
  n integer;
begin
  update public.fare_reports set user_id = null
  where user_id is not null and created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('fare_reports_anonymised', n);

  update public.overcharge_reports set user_id = null, vehicle_plate = null
  where user_id is not null and created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('overcharge_reports_anonymised', n);

  update public.hazard_reports set user_id = null
  where user_id is not null and created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('hazard_reports_anonymised', n);

  update public.driver_reports set user_id = null, vehicle_plate = null
  where (user_id is not null or vehicle_plate is not null) and created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('driver_reports_anonymised', n);

  update public.driver_ratings set user_id = null, vehicle_plate = null
  where (user_id is not null or vehicle_plate is not null) and created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('driver_ratings_anonymised', n);

  delete from public.trips_planned where created_at < now() - interval '12 months';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('trips_planned_deleted', n);

  delete from public.weather_snapshots where forecast_for < now() - interval '7 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('weather_snapshots_deleted', n);

  delete from public.notifications where created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('notifications_deleted', n);

  delete from public.trip_shares where expires_at < now() - interval '1 day';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('trip_shares_deleted', n);

  return result;
end;
$$;
