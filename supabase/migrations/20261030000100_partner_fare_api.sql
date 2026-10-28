-- P1-ADMIN-09: a fare API for GPRTU and other unions or operators (ADR 0016). Their system, or
-- their staff with a simple tool, sends fare changes with a partner key; the app updates at
-- once, keeps the history and alerts people who saved the route, as for staff changes.
--
-- Partners call the database function partner_update_fares(p_key, p_fares) through the same
-- public REST address as the app (docs/partner-fare-api.md). Keys are made by admins in the
-- admin's Partners page, shown once, and stored only as a hash.

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  operator_id uuid references public.operators (id) on delete set null,
  key_hash text not null unique,
  key_hint text not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
comment on table public.partners is 'Phase 1. Organisations allowed to send fare changes through partner_update_fares (ADR 0016).';

create table public.partner_fare_updates (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  received_at timestamptz not null default now(),
  fare_count integer not null,
  results jsonb not null
);
create index partner_fare_updates_received_idx on public.partner_fare_updates (received_at desc);
comment on table public.partner_fare_updates is 'Phase 1. What each partner call changed, for staff to check (kept 12 months).';

alter table public.partners enable row level security;
alter table public.partner_fare_updates enable row level security;
revoke all on public.partners, public.partner_fare_updates from public, anon, authenticated;
-- Admins see partners (never the key hash) and their updates.
grant select (id, name, operator_id, key_hint, created_at, last_used_at, revoked_at) on public.partners to authenticated;
grant select on public.partner_fare_updates to authenticated;
create policy partners_admin_read on public.partners for select to authenticated using (public.has_role('admin'));
create policy partner_updates_admin_read on public.partner_fare_updates for select to authenticated using (public.has_role('admin'));

create or replace function public.partner_key_hash(p_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
$$;
revoke execute on function public.partner_key_hash(text) from public, anon, authenticated;

-- Makes a partner and returns its key. The key is shown to the admin once and never stored.
create or replace function public.create_partner(p_name text, p_operator_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'gtp_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not public.has_role('admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.partners (name, operator_id, key_hash, key_hint)
  values (trim(p_name), p_operator_id, public.partner_key_hash(v_key), right(v_key, 4));
  return v_key;
end;
$$;

create or replace function public.revoke_partner(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role('admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.partners set revoked_at = coalesce(revoked_at, now()) where id = p_id;
end;
$$;

revoke execute on function public.create_partner(text, uuid) from public, anon;
revoke execute on function public.revoke_partner(uuid) from public, anon;
grant execute on function public.create_partner(text, uuid) to authenticated;
grant execute on function public.revoke_partner(uuid) to authenticated;

-- The fare logic of the spreadsheet import, shared with partner updates: create, confirm, change
-- (with history and alerts) or skip an older price. Callers check who may use it.
create or replace function public.apply_fare_rows(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_route_id uuid;
  v_source_id uuid;
  current_fare public.fares;
  observed_at timestamptz;
  new_id uuid;
  results jsonb := '[]'::jsonb;
begin
  for r in select * from jsonb_array_elements(rows) loop
    begin
      -- Field observations count as noon Accra time on the day observed.
      observed_at := ((r ->> 'observed_on')::date + time '12:00') at time zone 'Africa/Accra';

      select id into v_route_id from public.routes
      where origin_station_id = (r ->> 'origin_station_id')::uuid
        and destination_station_id = (r ->> 'destination_station_id')::uuid
        and kind = r ->> 'route_kind';
      if v_route_id is null then
        insert into public.routes (origin_station_id, destination_station_id, kind)
        values ((r ->> 'origin_station_id')::uuid, (r ->> 'destination_station_id')::uuid, r ->> 'route_kind')
        returning id into v_route_id;
      end if;

      v_source_id := null;
      if coalesce(r ->> 'source_name', '') <> '' then
        select id into v_source_id from public.fare_sources where lower(name) = lower(r ->> 'source_name') limit 1;
        if v_source_id is null then
          insert into public.fare_sources (kind, name, document_date)
          values ((r ->> 'source_kind')::public.fare_source_kind, r ->> 'source_name', (r ->> 'observed_on')::date)
          returning id into v_source_id;
        end if;
      end if;

      select * into current_fare from public.fares f
      where f.route_id = v_route_id
        and f.operator_id is not distinct from (r ->> 'operator_id')::uuid
        and f.vehicle_type = r ->> 'vehicle_type'
        and f.class = r ->> 'class'
        and f.effective_to is null;

      if current_fare.id is null then
        insert into public.fares (
          route_id, operator_id, vehicle_type, class, amount_pesewas, is_official, source_id,
          effective_from, last_confirmed_at, departure_mode, first_departure, last_departure,
          collected_by, evidence_url
        ) values (
          v_route_id, (r ->> 'operator_id')::uuid, r ->> 'vehicle_type', r ->> 'class',
          (r ->> 'amount_pesewas')::integer, (r ->> 'is_official')::boolean, v_source_id,
          (r ->> 'observed_on')::date, observed_at, coalesce(r ->> 'departure_mode', 'unknown'),
          (r ->> 'first_departure')::time, (r ->> 'last_departure')::time,
          r ->> 'collected_by', r ->> 'evidence_url'
        );
        results := results || jsonb_build_object('line', r -> 'line', 'status', 'created');

      elsif current_fare.amount_pesewas = (r ->> 'amount_pesewas')::integer then
        update public.fares
           set last_confirmed_at = greatest(last_confirmed_at, observed_at),
               collected_by = coalesce(r ->> 'collected_by', collected_by),
               evidence_url = coalesce(r ->> 'evidence_url', evidence_url)
         where id = current_fare.id;
        results := results || jsonb_build_object('line', r -> 'line', 'status', 'confirmed');

      elsif observed_at::date < (current_fare.last_confirmed_at at time zone 'Africa/Accra')::date then
        results := results || jsonb_build_object(
          'line', r -> 'line', 'status', 'skipped',
          'message', format('the current fare of %s pesewas was confirmed more recently, on %s',
                            current_fare.amount_pesewas,
                            to_char(current_fare.last_confirmed_at at time zone 'Africa/Accra', 'DD/MM/YYYY')));

      else
        new_id := public.change_fare(
          current_fare.id, (r ->> 'amount_pesewas')::integer,
          coalesce(v_source_id, current_fare.source_id), greatest((r ->> 'observed_on')::date, current_fare.effective_from)
        );
        update public.fares
           set last_confirmed_at = observed_at,
               is_official = (r ->> 'is_official')::boolean,
               departure_mode = coalesce(r ->> 'departure_mode', departure_mode),
               first_departure = coalesce((r ->> 'first_departure')::time, first_departure),
               last_departure = coalesce((r ->> 'last_departure')::time, last_departure),
               collected_by = r ->> 'collected_by',
               evidence_url = r ->> 'evidence_url'
         where id = new_id;
        results := results || jsonb_build_object('line', r -> 'line', 'status', 'changed',
          'message', format('was %s pesewas', current_fare.amount_pesewas));
      end if;
    exception when others then
      results := results || jsonb_build_object('line', r -> 'line', 'status', 'error', 'message', sqlerrm);
    end;
  end loop;
  return results;
end;
$$;

revoke execute on function public.apply_fare_rows(jsonb) from public, anon, authenticated;

-- The spreadsheet import, now through apply_fare_rows (same behaviour for staff).
create or replace function public.import_fares(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_edit_reference_data() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return public.apply_fare_rows(rows);
end;
$$;

-- What partners call. p_fares: up to 500 of
--   { "origin": station code, "destination": station code, "vehicle_type": "trotro",
--     "class": "standard" (optional), "amount_ghs": 12.5, "effective_from": "2026-11-01" (optional),
--     "departure_mode": "fill_and_go" (optional) }
-- Returns one result per fare, in order: created, confirmed, changed, skipped or error.
create or replace function public.partner_update_fares(p_key text, p_fares jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner public.partners;
  v_source_kind public.fare_source_kind;
  f jsonb;
  i integer := 0;
  v_origin public.stations;
  v_dest public.stations;
  v_amount numeric;
  v_rows jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_results jsonb;
begin
  select * into v_partner from public.partners
  where key_hash = public.partner_key_hash(p_key) and revoked_at is null;
  if v_partner.id is null then
    raise exception 'invalid partner key' using errcode = '28000';
  end if;
  if jsonb_typeof(p_fares) is distinct from 'array' or jsonb_array_length(p_fares) not between 1 and 500 then
    raise exception 'p_fares must be a list of 1 to 500 fares' using errcode = '22023';
  end if;

  select case when o.kind = 'trotro_union' then 'official_gprtu'::public.fare_source_kind else 'operator_list'::public.fare_source_kind end
  into v_source_kind from public.operators o where o.id = v_partner.operator_id;

  for f in select * from jsonb_array_elements(p_fares) loop
    i := i + 1;
    select * into v_origin from public.stations where slug = f ->> 'origin' and is_active;
    select * into v_dest from public.stations where slug = f ->> 'destination' and is_active;
    v_amount := case
      when jsonb_typeof(f -> 'amount_ghs') = 'number' then round((f ->> 'amount_ghs')::numeric * 100)
      when jsonb_typeof(f -> 'amount_pesewas') = 'number' then (f ->> 'amount_pesewas')::numeric
    end;
    if v_origin.id is null or v_dest.id is null then
      v_errors := v_errors || jsonb_build_object('line', i, 'status', 'error', 'message', 'unknown station code: '
        || coalesce(case when v_origin.id is null then f ->> 'origin' else f ->> 'destination' end, '(missing)'));
    elsif v_origin.id = v_dest.id then
      v_errors := v_errors || jsonb_build_object('line', i, 'status', 'error', 'message', 'origin and destination are the same');
    elsif v_amount is null or v_amount <= 0 or v_amount > 10000000 then
      v_errors := v_errors || jsonb_build_object('line', i, 'status', 'error', 'message', 'amount_ghs must be a price above 0');
    else
      v_rows := v_rows || jsonb_build_object(
        'line', i,
        'origin_station_id', v_origin.id,
        'destination_station_id', v_dest.id,
        'route_kind', case when lower(v_origin.city) = lower(v_dest.city) then 'intracity' else 'intercity' end,
        'operator_id', v_partner.operator_id,
        'vehicle_type', coalesce(f ->> 'vehicle_type', 'trotro'),
        'class', coalesce(f ->> 'class', 'standard'),
        'amount_pesewas', v_amount::integer,
        'is_official', true,
        'observed_on', coalesce(f ->> 'effective_from', (now() at time zone 'Africa/Accra')::date::text),
        -- Left out, the current departure mode is kept.
        'departure_mode', f ->> 'departure_mode',
        'source_kind', coalesce(v_source_kind, 'operator_list'),
        'source_name', v_partner.name || ' (fare API)',
        'collected_by', 'partner: ' || v_partner.name
      );
    end if;
  end loop;

  v_results := public.apply_fare_rows(v_rows);
  select coalesce(jsonb_agg(r order by (r ->> 'line')::integer), '[]'::jsonb) into v_results
  from jsonb_array_elements(v_results || v_errors) r;

  update public.partners set last_used_at = now() where id = v_partner.id;
  insert into public.partner_fare_updates (partner_id, fare_count, results)
  values (v_partner.id, jsonb_array_length(p_fares), v_results);
  return jsonb_build_object('partner', v_partner.name, 'results', v_results);
end;
$$;

revoke execute on function public.partner_update_fares(text, jsonb) from public;
grant execute on function public.partner_update_fares(text, jsonb) to anon, authenticated;

-- Retention: partner update logs are deleted after 12 months.
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

  delete from public.partner_fare_updates where received_at < now() - interval '12 months';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('partner_fare_updates_deleted', n);

  return result;
end;
$$;
