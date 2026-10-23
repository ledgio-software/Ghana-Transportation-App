-- Saved routes and fare-change alerts (P1-NOTIF): when a current fare is replaced by a new
-- price (admin change, spreadsheet import), everyone who saved that route with alerts on gets
-- an in-app notification. Push delivery is added once the push vendor is set up.

create or replace function public.notify_fare_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.fares;
begin
  -- change_fare() closes the old row on the day the new one starts.
  select * into previous from public.fares f
  where f.route_id = new.route_id
    and f.operator_id is not distinct from new.operator_id
    and f.vehicle_type = new.vehicle_type
    and f.class = new.class
    and f.id <> new.id
    and f.effective_to = new.effective_from
  order by f.created_at desc
  limit 1;

  if previous.id is null or previous.amount_pesewas = new.amount_pesewas then
    return null;
  end if;

  insert into public.notifications (user_id, kind, payload)
  select s.user_id, 'fare_changed', jsonb_build_object(
    'route_id', r.id,
    'origin_id', r.origin_station_id,
    'destination_id', r.destination_station_id,
    'origin_name', o.name,
    'destination_name', d.name,
    'fare_id', new.id,
    'operator_name', op.name,
    'vehicle_type', new.vehicle_type,
    'vehicle_type_name', vt.name,
    'class', new.class,
    'old_pesewas', previous.amount_pesewas,
    'new_pesewas', new.amount_pesewas,
    'effective_from', new.effective_from
  )
  from public.saved_routes s
  join public.routes r on r.id = s.route_id
  join public.stations o on o.id = r.origin_station_id
  join public.stations d on d.id = r.destination_station_id
  join public.vehicle_types vt on vt.code = new.vehicle_type
  left join public.operators op on op.id = new.operator_id
  where s.route_id = new.route_id and s.notify_fare_changes;

  return null;
end;
$$;

create trigger fares_notify_change after insert on public.fares
  for each row execute function public.notify_fare_change();

create index saved_routes_route_idx on public.saved_routes (route_id) where notify_fare_changes;
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- "Download my data" now includes alerts.
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
    'hazard_reports', coalesce((select jsonb_agg(h) from public.hazard_reports h where h.user_id = auth.uid()), '[]'),
    'notifications', coalesce((select jsonb_agg(n order by n.created_at) from public.notifications n where n.user_id = auth.uid()), '[]')
  );
$$;

-- Alerts are kept 90 days.
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

  delete from public.notifications where created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  result := result || jsonb_build_object('notifications_deleted', n);

  return result;
end;
$$;
