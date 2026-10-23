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
  begin
    update public.fares set amount_pesewas = 1;
    assert (select count(*) from public.fares where amount_pesewas = 1) = 0, 'anon must not edit fares';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

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
do $$ begin
  assert (public.purge_expired_data() ->> 'fare_reports_anonymised')::int = 1, 'old report anonymised';
end $$;

\echo 'All database checks passed'
