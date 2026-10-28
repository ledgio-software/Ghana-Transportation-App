-- Behaviour checks for the access rules. Run after bootstrap, migrations and seed.
\set ON_ERROR_STOP on

insert into auth.users (id, phone) values
  ('00000000-0000-4000-8000-00000000a001', '+233240000001'),
  ('00000000-0000-4000-8000-00000000a002', '+233240000002'),
  ('00000000-0000-4000-8000-00000000a003', '+233240000003');
insert into public.user_roles (user_id, role) values ('00000000-0000-4000-8000-00000000a003', 'data_editor');

do $$ begin
  assert (select count(*) from public.profiles) = 3, 'profile created for every new user';
end $$;

-- Signed-out traveller can search fares but cannot write reference data.
set role anon;
do $$
declare n integer;
begin
  select count(*) into n from public.search_fares(
    '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000204');
  assert n = 2, format('expected 2 Circle->Asafo options, got %s', n);
  assert (select array_agg(official_pesewas) from public.search_fares(
    '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000204')) = array[12000, 15000],
    'cheapest option first';
  begin
    update public.fares set amount_pesewas = 1;
    assert (select count(*) from public.fares where amount_pesewas = 1) = 0, 'anon must not edit fares';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Reports need agreement to the terms and privacy notice first.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a001';
do $$ begin
  begin
    insert into public.fare_reports (client_id, route_id, vehicle_type, amount_pesewas, travelled_at)
    values (gen_random_uuid(), '00000000-0000-4000-8000-000000000301', 'trotro', 1100, now());
    raise exception 'report accepted without consent';
  exception when insufficient_privilege then null;
  end;
end $$;
insert into public.consents (user_id, consent_type, document_version, granted) values
  ('00000000-0000-4000-8000-00000000a001', 'terms', 'v1', true),
  ('00000000-0000-4000-8000-00000000a001', 'privacy', 'v1', true);
reset role;
-- Passenger B (used for the rate-limit check) agreed too.
insert into public.consents (user_id, consent_type, document_version, granted) values
  ('00000000-0000-4000-8000-00000000a002', 'terms', 'v1', true),
  ('00000000-0000-4000-8000-00000000a002', 'privacy', 'v1', true);

-- Passenger A reports a fare; passenger B cannot see it; the median reflects it.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a001';
insert into public.fare_reports (client_id, route_id, operator_id, vehicle_type, amount_pesewas, travelled_at)
values ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000301',
        '00000000-0000-4000-8000-000000000103', 'trotro', 2000, now());
do $$
declare upd integer;
begin
  assert (select reported_median_pesewas from public.search_fares(
    '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000202')) = 2000,
    'median includes the new report';
  update public.fares set amount_pesewas = 1;
  get diagnostics upd = row_count;
  assert upd = 0, 'passengers cannot edit fares';
  assert (public.export_my_data() -> 'fare_reports' -> 0 ->> 'amount_pesewas') = '2000', 'export includes own report';
end $$;

-- Same client_id again (offline outbox retry) is rejected as a duplicate, not stored twice.
do $$ begin
  insert into public.fare_reports (client_id, route_id, vehicle_type, amount_pesewas, travelled_at)
  values ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000301', 'trotro', 2000, now());
  raise exception 'duplicate client_id was accepted';
exception when unique_violation then null;
end $$;

-- Users cannot report on behalf of someone else.
do $$ begin
  insert into public.fare_reports (client_id, user_id, route_id, vehicle_type, amount_pesewas, travelled_at)
  values (gen_random_uuid(), '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-000000000301', 'trotro', 1100, now());
  raise exception 'report for another user was accepted';
exception when insufficient_privilege then null;
end $$;

set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a002';
do $$ begin
  assert (select count(*) from public.fare_reports) = 0, 'B cannot read A''s reports';
  assert (select count(*) from public.profiles) = 1, 'B sees only own profile';
end $$;

-- Data editor without two-factor (aal1) has no staff powers.
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a003';
set request.jwt.claims = '{"aal": "aal1"}';
do $$
declare upd integer;
begin
  update public.fares set last_confirmed_at = now() where route_id = '00000000-0000-4000-8000-000000000302';
  get diagnostics upd = row_count;
  assert upd = 0, 'staff without two-factor cannot edit fares';
end $$;

-- With two-factor (aal2) the editor can confirm and change fares; every change is audited.
set request.jwt.claims = '{"aal": "aal2"}';
update public.fares set last_confirmed_at = now()
where route_id = '00000000-0000-4000-8000-000000000302';
do $$
declare
  old_id uuid;
  new_id uuid;
begin
  select id into old_id from public.fares
  where route_id = '00000000-0000-4000-8000-000000000301' and effective_to is null;
  new_id := public.change_fare(old_id, 1300);
  assert (select effective_to from public.fares where id = old_id) is not null, 'old fare closed';
  assert (select official_pesewas from public.search_fares(
    '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000202')) = 1300,
    'search shows the new fare';
  assert (select count(*) from public.fares where route_id = '00000000-0000-4000-8000-000000000301') = 2,
    'history kept';
end $$;
reset role;
reset request.jwt.claims;
do $$ begin
  assert (select count(*) from public.audit_log
          where table_name = 'fares' and action = 'update'
            and actor_id = '00000000-0000-4000-8000-00000000a003') = 2, 'fare edits audited with actor';
  assert (select count(*) from public.audit_log
          where table_name = 'fares' and action = 'insert'
            and actor_id = '00000000-0000-4000-8000-00000000a003') = 1, 'new fare audited with actor';
end $$;

-- Rate limit: the 21st report within an hour is refused.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a002';
do $$
begin
  for i in 1..20 loop
    insert into public.fare_reports (client_id, route_id, vehicle_type, amount_pesewas, travelled_at)
    values (gen_random_uuid(), '00000000-0000-4000-8000-000000000302', 'trotro', 500, now());
  end loop;
  begin
    insert into public.fare_reports (client_id, route_id, vehicle_type, amount_pesewas, travelled_at)
    values (gen_random_uuid(), '00000000-0000-4000-8000-000000000302', 'trotro', 500, now());
    raise exception 'rate limit not enforced';
  exception when raise_exception then
    if sqlerrm <> 'too many reports, try again later' then raise; end if;
  end;
end $$;
reset role;

-- Retention job anonymises old reports.
update public.fare_reports set created_at = now() - interval '91 days'
where client_id = '11111111-1111-4111-8111-111111111111';
insert into public.trips_planned (user_id, origin_station_id, destination_station_id, created_at) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000202', now() - interval '13 months'),
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000202', now());
insert into public.weather_snapshots (location, forecast_for, provider, data) values
  (extensions.st_geogfromtext('POINT(-0.2 5.6)'), now() - interval '8 days', 'test', '{}');
do $$
declare res jsonb;
begin
  res := public.purge_expired_data();
  assert (res ->> 'fare_reports_anonymised')::int = 1, 'old report anonymised';
  assert (res ->> 'trips_planned_deleted')::int = 1, 'trip older than 12 months deleted, recent kept';
  assert (res ->> 'weather_snapshots_deleted')::int = 1, 'old weather deleted';
end $$;

-- Admin tools: station editor with coordinates.
insert into auth.users (id, phone) values ('00000000-0000-4000-8000-00000000a004', '+233240000004');
insert into public.user_roles (user_id, role) values ('00000000-0000-4000-8000-00000000a004', 'moderator');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a003';
set request.jwt.claims = '{"aal": "aal2"}';
do $$
declare sid uuid;
begin
  sid := public.save_station(null, 'Kaneshie', 'kaneshie', 'lorry_station', 'Accra', 'Greater Accra', 5.5660, -0.2360, 'GA-123-4567');
  assert (select round(latitude::numeric, 4) from public.stations where id = sid) = 5.5660, 'latitude stored';
  assert (select round(longitude::numeric, 4) from public.stations where id = sid) = -0.2360, 'longitude stored';
  assert not (select flood_prone from public.stations where id = sid), 'not flood-prone unless marked';
  perform public.save_station(sid, 'Kaneshie Market', 'kaneshie', 'lorry_station', 'Accra', 'Greater Accra', 5.5670, -0.2370,
    p_flood_prone => true);
  assert (select name from public.stations where id = sid) = 'Kaneshie Market', 'station updated';
  assert (select flood_prone from public.stations where id = sid), 'marked flood-prone';
  begin
    -- latitude and longitude swapped: lands outside Ghana
    perform public.save_station(null, 'Swapped', 'swapped', 'stop', 'Accra', null, -0.2360, 5.5660);
    raise exception 'swapped coordinates accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- A passenger cannot save stations or moderate.
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a001';
do $$ begin
  begin
    perform public.save_station(null, 'Fake', 'fake', 'stop', 'Accra', null, 5.6, -0.2);
    raise exception 'passenger saved a station';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.moderate_report('fare', (select id from public.fare_reports limit 1), 'accepted');
    raise exception 'passenger moderated';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Moderator with two-factor accepts a report; amounts cannot be edited directly.
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a004';
do $$
declare
  rid uuid;
  upd integer;
begin
  select id into rid from public.fare_reports where status = 'pending' limit 1;
  perform public.moderate_report('fare', rid, 'accepted');
  assert (select status from public.fare_reports where id = rid) = 'accepted', 'report accepted';
  assert (select moderated_by from public.fare_reports where id = rid) = '00000000-0000-4000-8000-00000000a004', 'moderator recorded';
  update public.fare_reports set amount_pesewas = 1 where id = rid;
  get diagnostics upd = row_count;
  assert upd = 0, 'moderators cannot edit report amounts';
end $$;
set request.jwt.claims = '{"aal": "aal1"}';
do $$ begin
  begin
    perform public.moderate_report('fare', (select id from public.fare_reports limit 1), 'rejected');
    raise exception 'moderator without two-factor moderated';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
reset request.jwt.claims;

-- Spreadsheet import: stations then fares, row by row.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a003';
set request.jwt.claims = '{"aal": "aal2"}';
do $$
declare res jsonb;
begin
  res := public.import_stations(jsonb_build_array(
    jsonb_build_object('line', 2, 'name', 'Madina', 'slug', 'madina', 'kind', 'lorry_station', 'city', 'Accra',
                       'region', 'Greater Accra', 'latitude', 5.6680, 'longitude', -0.1650, 'ghanapost_gps', 'GM-001-0001'),
    jsonb_build_object('line', 3, 'name', 'Kasoa', 'slug', 'kasoa', 'kind', 'lorry_station', 'city', 'Kasoa',
                       'region', 'Central', 'latitude', 5.5345, 'longitude', -0.4175),
    jsonb_build_object('line', 4, 'name', 'Lagos', 'slug', 'lagos', 'kind', 'stop', 'city', 'Lagos',
                       'region', null, 'latitude', 6.5, 'longitude', 3.4)
  ));
  assert res -> 0 ->> 'status' = 'created', res::text;
  assert res -> 1 ->> 'status' = 'updated', res::text;
  assert res -> 2 ->> 'status' = 'error' and res -> 2 ->> 'message' like '%outside Ghana%', res::text;
  assert (select round(longitude::numeric, 4) from public.stations where slug = 'kasoa') = -0.4175, 'kasoa moved';

  res := public.import_fares(jsonb_build_array(
    -- new route and fare
    jsonb_build_object('line', 2, 'origin_station_id', '00000000-0000-4000-8000-000000000205',
      'destination_station_id', '00000000-0000-4000-8000-000000000204', 'route_kind', 'intracity',
      'operator_id', null, 'vehicle_type', 'trotro', 'class', 'standard', 'amount_pesewas', 300,
      'is_official', true, 'observed_on', '2026-10-20', 'source_name', 'Kejetia board Oct 2026',
      'source_kind', 'station_board', 'departure_mode', 'fill_and_go', 'first_departure', '05:00',
      'last_departure', null, 'collected_by', 'Ama', 'evidence_url', 'https://example.com/board.jpg'),
    -- same fare seen again a day later
    jsonb_build_object('line', 3, 'origin_station_id', '00000000-0000-4000-8000-000000000205',
      'destination_station_id', '00000000-0000-4000-8000-000000000204', 'route_kind', 'intracity',
      'operator_id', null, 'vehicle_type', 'trotro', 'class', 'standard', 'amount_pesewas', 300,
      'is_official', true, 'observed_on', '2026-10-21', 'source_name', 'kejetia BOARD oct 2026',
      'source_kind', 'station_board', 'departure_mode', 'fill_and_go', 'first_departure', null,
      'last_departure', null, 'collected_by', null, 'evidence_url', null),
    -- old observation of a fare confirmed today: skipped
    jsonb_build_object('line', 4, 'origin_station_id', '00000000-0000-4000-8000-000000000201',
      'destination_station_id', '00000000-0000-4000-8000-000000000202', 'route_kind', 'intracity',
      'operator_id', '00000000-0000-4000-8000-000000000103', 'vehicle_type', 'trotro', 'class', 'standard',
      'amount_pesewas', 1400, 'is_official', true, 'observed_on', '2026-01-01', 'source_name', null,
      'source_kind', 'field_ridden', 'departure_mode', 'fill_and_go', 'first_departure', null,
      'last_departure', null, 'collected_by', 'Kofi', 'evidence_url', null),
    -- new price seen today: changed, history kept
    jsonb_build_object('line', 5, 'origin_station_id', '00000000-0000-4000-8000-000000000201',
      'destination_station_id', '00000000-0000-4000-8000-000000000202', 'route_kind', 'intracity',
      'operator_id', '00000000-0000-4000-8000-000000000103', 'vehicle_type', 'trotro', 'class', 'standard',
      'amount_pesewas', 1500, 'is_official', true, 'observed_on', to_char(now() at time zone 'Africa/Accra', 'YYYY-MM-DD'),
      'source_name', null, 'source_kind', 'field_ridden', 'departure_mode', 'fill_and_go',
      'first_departure', null, 'last_departure', null, 'collected_by', 'Kofi', 'evidence_url', null),
    -- unknown vehicle type: error, others unaffected
    jsonb_build_object('line', 6, 'origin_station_id', '00000000-0000-4000-8000-000000000205',
      'destination_station_id', '00000000-0000-4000-8000-000000000204', 'route_kind', 'intracity',
      'operator_id', null, 'vehicle_type', 'hovercraft', 'class', 'standard', 'amount_pesewas', 300,
      'is_official', false, 'observed_on', '2026-10-21', 'source_name', null, 'source_kind', 'field_ridden',
      'departure_mode', 'unknown', 'first_departure', null, 'last_departure', null,
      'collected_by', null, 'evidence_url', null)
  ));
  assert (select jsonb_agg(x ->> 'status') from jsonb_array_elements(res) x)
         = '["created", "confirmed", "skipped", "changed", "error"]'::jsonb, res::text;
  assert (select count(*) from public.fare_sources where lower(name) = 'kejetia board oct 2026') = 1, 'source reused, not duplicated';
  assert (select collected_by from public.fares f join public.routes r on r.id = f.route_id
          where r.origin_station_id = '00000000-0000-4000-8000-000000000205' and f.effective_to is null) = 'Ama',
         'collector kept on confirm';
  assert (select (last_confirmed_at at time zone 'Africa/Accra')::date from public.fares f join public.routes r on r.id = f.route_id
          where r.origin_station_id = '00000000-0000-4000-8000-000000000205' and f.effective_to is null) = '2026-10-21',
         'confirmation date moved forward';
  assert (select official_pesewas from public.search_fares(
    '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000202')) = 1500, 'changed fare is current';
end $$;

set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a001';
do $$ begin
  begin
    perform public.import_fares('[]'::jsonb);
    raise exception 'passenger ran an import';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
reset request.jwt.claims;

-- Withdrawing agreement (latest answer "no") stops further reports.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a001';
insert into public.consents (user_id, consent_type, document_version, granted)
values ('00000000-0000-4000-8000-00000000a001', 'privacy', 'v1', false);
do $$ begin
  begin
    insert into public.overcharge_reports (client_id, route_id, kind, quoted_pesewas, occurred_at)
    values (gen_random_uuid(), '00000000-0000-4000-8000-000000000301', 'overcharge', 2000, now());
    raise exception 'report accepted after consent withdrawn';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Saved routes: a fare change alerts people who saved the route; a confirmation does not.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a002';
insert into public.saved_routes (route_id) values ('00000000-0000-4000-8000-000000000302');
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a003';
insert into public.saved_routes (route_id, notify_fare_changes) values ('00000000-0000-4000-8000-000000000302', false);
set request.jwt.claims = '{"aal": "aal2"}';
do $$
declare fid uuid;
begin
  select id into fid from public.fares where route_id = '00000000-0000-4000-8000-000000000302' and effective_to is null;
  update public.fares set last_confirmed_at = now() where id = fid;
  perform public.change_fare(fid, 600);
end $$;
reset request.jwt.claims;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a002';
do $$
declare n public.notifications;
begin
  assert (select count(*) from public.notifications) = 1, 'one alert for the saver';
  select * into n from public.notifications;
  assert n.kind = 'fare_changed', n.kind;
  assert (n.payload ->> 'old_pesewas')::int = 500 and (n.payload ->> 'new_pesewas')::int = 600, n.payload::text;
  assert n.payload ->> 'origin_name' = 'Kwame Nkrumah Circle' and n.payload ->> 'destination_name' = 'Fadama', n.payload::text;
  update public.notifications set read_at = now() where id = n.id;
  assert (select read_at from public.notifications where id = n.id) is not null, 'can mark own alert read';
  assert jsonb_array_length(public.export_my_data() -> 'notifications') = 1, 'alerts in data export';
end $$;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a003';
do $$ begin
  assert (select count(*) from public.notifications) = 0, 'alerts off: nothing';
end $$;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a001';
do $$ begin
  assert (select count(*) from public.notifications) = 0, 'did not save the route: nothing';
  assert (select count(*) from public.saved_routes) = 0, 'cannot see other people''s saved routes';
end $$;
reset role;

-- Rejected reports do not count towards "people paid this week"; absurd amounts are refused.
insert into public.fare_reports (client_id, user_id, route_id, operator_id, vehicle_type, class, amount_pesewas, travelled_at, status) values
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000101', 'bus', 'executive', 15500, now(), 'accepted'),
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000101', 'bus', 'executive', 99900, now(), 'rejected');
do $$ begin
  assert (select reported_median_pesewas from public.search_fares(
    '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000204') where class = 'executive') = 15500,
    'rejected report left out of the median';
  begin
    insert into public.fare_reports (client_id, user_id, route_id, vehicle_type, amount_pesewas, travelled_at)
    values (gen_random_uuid(), '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-000000000303', 'bus', 10000000, now());
    raise exception 'GH¢100,000 report accepted';
  exception when check_violation then null;
  end;
end $$;

-- Alerts older than 90 days are deleted.
insert into public.notifications (user_id, kind, created_at) values ('00000000-0000-4000-8000-00000000a002', 'fare_changed', now() - interval '91 days');
do $$ begin
  assert (public.purge_expired_data() ->> 'notifications_deleted')::int = 1, 'old alert deleted';
end $$;

-- Safety: emergency numbers are public; staff edit them.
set role anon;
do $$ begin
  assert (select phone from public.emergency_contacts order by sort_order limit 1) = '112', '112 listed first';
  begin
    insert into public.emergency_contacts (name, phone, kind) values ('Fake', '0000', 'police');
    raise exception 'anon added an emergency number';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a003';
set request.jwt.claims = '{"aal": "aal2"}';
insert into public.emergency_contacts (name, phone, kind, sort_order) values ('MTTD Accra (test)', '0302000000', 'road_safety', 60);
do $$ begin
  begin
    insert into public.emergency_contacts (name, phone, kind) values ('Bad number', 'call me', 'police');
    raise exception 'letters accepted as a phone number';
  exception when check_violation then null;
  end;
end $$;
reset role;
reset request.jwt.claims;

-- Driver reports: own photos only, then staff forward them; the reporter cannot change status.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a002';
insert into storage.objects (bucket_id, name) values ('report-photos', '00000000-0000-4000-8000-00000000a002/r1/1.jpg');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('report-photos', '00000000-0000-4000-8000-00000000a001/x.jpg');
    raise exception 'uploaded into someone else''s folder';
  exception when insufficient_privilege then null;
  end;
end $$;
insert into public.driver_reports (client_id, kind, vehicle_plate, occurred_at, note, photo_paths)
values ('00000000-0000-4000-8000-0000000dd001', 'reckless_driving', 'GR 1234-24', now(), 'Overtaking on a curve',
        array['00000000-0000-4000-8000-00000000a002/r1/1.jpg']);
do $$ begin
  begin
    insert into public.driver_reports (client_id, kind, occurred_at, photo_paths)
    values (gen_random_uuid(), 'abuse', now(), array['00000000-0000-4000-8000-00000000a001/x.jpg']);
    raise exception 'report used someone else''s photo';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.driver_reports (client_id, kind, occurred_at, status) values (gen_random_uuid(), 'abuse', now(), 'forwarded');
    raise exception 'reporter set the status';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.handle_driver_report((select id from public.driver_reports where client_id = '00000000-0000-4000-8000-0000000dd001'), 'closed', null, null);
    raise exception 'reporter handled their own report';
  exception when insufficient_privilege then null;
  end;
  insert into public.driver_ratings (client_id, rating, tags, travelled_at) values (gen_random_uuid(), 5, array['safe_driving', 'polite'], now());
  begin
    insert into public.driver_ratings (client_id, rating, travelled_at) values (gen_random_uuid(), 6, now());
    raise exception 'rating 6 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.driver_ratings (client_id, rating, tags, travelled_at) values (gen_random_uuid(), 3, array['made_up'], now());
    raise exception 'unknown tag accepted';
  exception when check_violation then null;
  end;
  assert jsonb_array_length(public.export_my_data() -> 'driver_reports') = 1, 'report in data export';
  assert jsonb_array_length(public.export_my_data() -> 'driver_ratings') = 1, 'rating in data export';
end $$;
-- Passenger A withdrew agreement above, so cannot report a driver; nor see B's report or photo.
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a001';
do $$ begin
  begin
    insert into public.driver_reports (client_id, kind, occurred_at) values (gen_random_uuid(), 'abuse', now());
    raise exception 'report without agreement accepted';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.driver_reports) = 0, 'cannot see other people''s driver reports';
  assert (select count(*) from storage.objects where bucket_id = 'report-photos') = 0, 'cannot see other people''s photos';
end $$;
-- Moderator with two-factor sees it with its photo and forwards it.
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a004';
set request.jwt.claims = '{"aal": "aal2"}';
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'report-photos') = 1, 'moderator sees the photo';
  begin
    perform public.handle_driver_report((select id from public.driver_reports where client_id = '00000000-0000-4000-8000-0000000dd001'), 'forwarded', ' ', null);
    raise exception 'forwarded without saying to whom';
  exception when invalid_parameter_value then null;
  end;
  perform public.handle_driver_report((select id from public.driver_reports where client_id = '00000000-0000-4000-8000-0000000dd001'), 'forwarded', 'MTTD Accra', 'Called the desk');
  assert (select status || '|' || forwarded_to || '|' || staff_note from public.driver_reports) = 'forwarded|MTTD Accra|Called the desk', 'forwarded';
  assert (select count(*) from public.driver_ratings) = 1, 'moderator sees ratings';
end $$;
reset role;
reset request.jwt.claims;

-- After 90 days: reporter and plate removed; photos listed for deletion, then forgotten.
update public.driver_reports set created_at = now() - interval '91 days';
do $$ begin
  assert (public.purge_expired_data() ->> 'driver_reports_anonymised')::int = 1, 'driver report anonymised';
  assert (select user_id is null and vehicle_plate is null from public.driver_reports), 'reporter and plate removed';
end $$;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000a004';
set request.jwt.claims = '{"aal": "aal2"}';
do $$ begin
  assert (select count(*) from public.expired_report_photos()) = 1, 'expired photo listed';
  assert public.forget_report_photos(array[(select id from public.driver_reports where client_id = '00000000-0000-4000-8000-0000000dd001')]) = 1, 'photo paths cleared';
  assert (select count(*) from public.expired_report_photos()) = 0, 'nothing left to delete';
end $$;
reset role;
reset request.jwt.claims;

-- Share my trip: anyone can start one; only the secret moves the dot or stops it; the family
-- page sees the position only while the share is live; nobody reads the table directly.
create temp table share_test (id uuid, secret text);
grant all on share_test to anon;
set role anon;
insert into share_test select share_id, secret from public.start_trip_share(
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000204');
do $$
declare s record; r record;
begin
  select * into s from share_test;
  select * into r from public.get_trip_share(s.id);
  assert r.status = 'live' and r.latitude is null, 'live share, no position yet';
  assert r.origin_name is not null and r.destination_name is not null, 'station names shown';
  assert public.update_trip_share(s.id, s.secret, 5.56, -0.2) , 'phone moves the dot';
  assert not public.update_trip_share(s.id, 'wrong', 5.6, -0.1), 'wrong secret ignored';
  select * into r from public.get_trip_share(s.id);
  assert r.latitude = 5.56 and r.longitude = -0.2 and r.located_at is not null, 'family sees the dot';
  begin
    perform public.update_trip_share(s.id, s.secret, 51.5, -0.1);
    raise exception 'position outside Ghana accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.start_trip_share(gen_random_uuid(), '00000000-0000-4000-8000-000000000204');
    raise exception 'unknown station accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform count(*) from public.trip_shares;
    raise exception 'table readable directly';
  exception when insufficient_privilege then null;
  end;
  assert not public.end_trip_share(s.id, 'wrong'), 'wrong secret cannot stop it';
  assert public.end_trip_share(s.id, s.secret), 'phone stops sharing';
  select * into r from public.get_trip_share(s.id);
  assert r.status = 'ended' and r.latitude is null, 'ended share hides the position';
  assert not public.update_trip_share(s.id, s.secret, 5.57, -0.2), 'no updates after stopping';
  assert (select count(*) from public.get_trip_share(gen_random_uuid())) = 0, 'unknown link shows nothing';
end $$;
reset role;
-- Expired shares hide the position, and are deleted a day later.
update public.trip_shares set latitude = 5.5, longitude = -0.2, ended_at = null, expires_at = now() - interval '1 minute';
do $$ begin
  assert (select status from public.get_trip_share((select id from share_test))) = 'expired', 'expired';
  assert (select latitude is null from public.get_trip_share((select id from share_test))), 'expired share hides the position';
  assert (public.purge_expired_data() ->> 'trip_shares_deleted')::int = 0, 'kept for a day';
end $$;
update public.trip_shares set expires_at = now() - interval '25 hours';
do $$ begin
  assert (public.purge_expired_data() ->> 'trip_shares_deleted')::int = 1, 'deleted a day after expiry';
end $$;

\echo 'All database checks passed'
