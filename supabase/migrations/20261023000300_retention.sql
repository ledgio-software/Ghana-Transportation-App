-- Data retention (Act 843 "no longer than necessary"). Draft windows from Phase 0 doc 2.1,
-- to be confirmed with a lawyer (ADR 0012):
--   fare, overcharge and hazard reports: kept, but anonymised after 90 days
--   trip summaries: 12 months
--   expired weather cache: 7 days
-- Raw GPS points (Phase 2 location_pings, 30 days) are added to this function in Phase 2.

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

  delete from public.trips_planned where created_at < now() - interval '12 months';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('trips_planned_deleted', n);

  delete from public.weather_snapshots where forecast_for < now() - interval '7 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('weather_snapshots_deleted', n);

  return result;
end;
$$;

revoke execute on function public.purge_expired_data() from public, anon, authenticated;

-- Supabase ships pg_cron; plain Postgres (CI) may not, so schedule only when it is available.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('purge-expired-data', '17 2 * * *', 'select public.purge_expired_data()');
  end if;
end;
$$;
