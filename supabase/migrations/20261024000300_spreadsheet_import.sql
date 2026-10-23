-- Spreadsheet import for the field team (Phase 0 doc 4.2). The admin checks every row in the
-- browser first; these functions apply the checked rows one by one, so a bad row is reported
-- with its spreadsheet line and the rest still go in. Both run with the caller's rights.

alter table public.fares
  add column collected_by text,
  add column evidence_url text;
comment on column public.fares.collected_by is 'Field researcher who recorded this fare.';
comment on column public.fares.evidence_url is 'Photo of the station board or price list.';

-- rows: [{line, name, slug, kind, city, region, latitude, longitude, ghanapost_gps}]
create or replace function public.import_stations(rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r jsonb;
  existing uuid;
  results jsonb := '[]'::jsonb;
begin
  if not public.can_edit_reference_data() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  for r in select * from jsonb_array_elements(rows) loop
    begin
      select id into existing from public.stations where slug = r ->> 'slug';
      perform public.save_station(
        existing, r ->> 'name', r ->> 'slug', r ->> 'kind', r ->> 'city', r ->> 'region',
        (r ->> 'latitude')::double precision, (r ->> 'longitude')::double precision,
        r ->> 'ghanapost_gps', true
      );
      results := results || jsonb_build_object(
        'line', r -> 'line', 'status', case when existing is null then 'created' else 'updated' end);
    exception when others then
      results := results || jsonb_build_object('line', r -> 'line', 'status', 'error', 'message', sqlerrm);
    end;
  end loop;
  return results;
end;
$$;

-- rows: [{line, origin_station_id, destination_station_id, route_kind, operator_id, vehicle_type,
--         class, amount_pesewas, is_official, observed_on, source_name, source_kind,
--         departure_mode, first_departure, last_departure, collected_by, evidence_url}]
-- Per row: no current fare -> created; same amount -> confirmed; new amount observed on or after
-- the current fare's last confirmation -> changed (history kept); older observation -> skipped.
create or replace function public.import_fares(rows jsonb)
returns jsonb
language plpgsql
security invoker
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
  if not public.can_edit_reference_data() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

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
          (r ->> 'observed_on')::date, observed_at, r ->> 'departure_mode',
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
               departure_mode = r ->> 'departure_mode',
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

revoke execute on function public.import_stations(jsonb) from public, anon;
revoke execute on function public.import_fares(jsonb) from public, anon;
grant execute on function public.import_stations(jsonb) to authenticated;
grant execute on function public.import_fares(jsonb) to authenticated;
