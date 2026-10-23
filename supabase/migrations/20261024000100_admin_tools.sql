-- Admin tools for the field team (P1-ADMIN): station editor with plain coordinates,
-- report moderation through one audited function.

-- ---------------------------------------------------------------------------
-- Stations: readable coordinates, and a save function that takes latitude/longitude
-- ---------------------------------------------------------------------------

alter table public.stations
  add column latitude double precision
    generated always as (extensions.st_y(location::extensions.geometry)) stored,
  add column longitude double precision
    generated always as (extensions.st_x(location::extensions.geometry)) stored;

-- Creates a station (p_id null) or updates one. Runs with the caller's rights,
-- so row level security decides who may save.
create or replace function public.save_station(
  p_id uuid,
  p_name text,
  p_slug text,
  p_kind text,
  p_city text,
  p_region text,
  p_latitude double precision,
  p_longitude double precision,
  p_ghanapost_gps text default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
  point extensions.geography;
begin
  -- Ghana lies roughly within 4.5-11.5 N and 3.5 W-1.5 E; reject swapped or mistyped coordinates.
  if p_latitude not between 4.5 and 11.5 or p_longitude not between -3.5 and 1.5 then
    raise exception 'coordinates % , % are outside Ghana', p_latitude, p_longitude using errcode = '22023';
  end if;
  point := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;

  if p_id is null then
    insert into public.stations (name, slug, kind, city, region, location, ghanapost_gps, is_active)
    values (p_name, p_slug, p_kind, p_city, p_region, point, nullif(p_ghanapost_gps, ''), p_is_active)
    returning id into saved_id;
  else
    update public.stations
       set name = p_name, slug = p_slug, kind = p_kind, city = p_city, region = p_region,
           location = point, ghanapost_gps = nullif(p_ghanapost_gps, ''), is_active = p_is_active
     where id = p_id
    returning id into saved_id;
    if saved_id is null then
      raise exception 'station % not found or not editable', p_id using errcode = 'P0002';
    end if;
  end if;
  return saved_id;
end;
$$;

revoke execute on function public.save_station(uuid, text, text, text, text, text, double precision, double precision, text, boolean) from public, anon;
grant execute on function public.save_station(uuid, text, text, text, text, text, double precision, double precision, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Moderation: moderators change only the status, never the reported amounts
-- ---------------------------------------------------------------------------

drop policy "fare_reports: moderators update" on public.fare_reports;
drop policy "overcharge_reports: moderators update" on public.overcharge_reports;
drop policy "hazard_reports: moderators update" on public.hazard_reports;

create or replace function public.moderate_report(p_kind text, p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text;
  updated integer;
begin
  if not public.can_moderate() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('accepted', 'rejected') then
    raise exception 'status must be accepted or rejected' using errcode = '22023';
  end if;
  target := case p_kind
    when 'fare' then 'fare_reports'
    when 'overcharge' then 'overcharge_reports'
    when 'hazard' then 'hazard_reports'
  end;
  if target is null then
    raise exception 'unknown report kind %', p_kind using errcode = '22023';
  end if;

  execute format('update public.%I set status = $1, moderated_by = $2 where id = $3', target)
    using p_status, auth.uid(), p_id;
  -- EXECUTE does not set FOUND; read the row count instead.
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'report % not found', p_id using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.moderate_report(text, uuid, text) from public, anon;
grant execute on function public.moderate_report(text, uuid, text) to authenticated;

-- Reports are not copied into audit_log (it would keep reporter ids past the 90-day
-- anonymisation); moderated_by records who decided.

-- Staff edits to these tables were not audited in the first migration.
create trigger fare_sources_audit after insert or update or delete on public.fare_sources
  for each row execute function public.audit_row();
create trigger route_stops_audit after insert or update or delete on public.route_stops
  for each row execute function public.audit_row();
create trigger places_audit after insert or update or delete on public.places
  for each row execute function public.audit_row();
