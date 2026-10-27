-- Safety (P1-SAFE): emergency numbers, reports about a driver (reckless driving, abuse of
-- passengers) with photos of the vehicle, and passenger ratings of the driver.

-- ---------------------------------------------------------------------------
-- Emergency numbers: shown in the app (and saved on the phone), edited by staff
-- ---------------------------------------------------------------------------

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  phone text not null check (phone ~ '^\+?[0-9]{3,15}$'),
  kind text not null check (kind in ('emergency', 'police', 'fire', 'ambulance', 'road_safety', 'operator', 'other')),
  note text check (char_length(note) <= 200),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger emergency_contacts_set_updated_at before update on public.emergency_contacts
  for each row execute function public.set_updated_at();
create trigger emergency_contacts_audit after insert or update or delete on public.emergency_contacts
  for each row execute function public.audit_row();

alter table public.emergency_contacts enable row level security;
create policy "emergency_contacts: public read" on public.emergency_contacts for select to anon, authenticated
  using (is_active or public.can_edit_reference_data());
create policy "emergency_contacts: staff write" on public.emergency_contacts for all to authenticated
  using (public.can_edit_reference_data()) with check (public.can_edit_reference_data());

-- 112 is the national number for police, fire and ambulance (2020). The older direct numbers
-- are still widely listed. Staff add MTTD, NRSA and operator lines once confirmed.
insert into public.emergency_contacts (name, phone, kind, note, sort_order) values
  ('All emergencies', '112', 'emergency', 'Police, fire and ambulance', 10),
  ('Police', '191', 'police', null, 20),
  ('Police (toll-free)', '18555', 'police', null, 30),
  ('Fire service', '192', 'fire', null, 40),
  ('Ambulance', '193', 'ambulance', null, 50);

-- ---------------------------------------------------------------------------
-- Reports about a driver, with up to 3 photos of the vehicle
-- ---------------------------------------------------------------------------

create table public.driver_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  kind text not null check (kind in (
    'reckless_driving', 'drunk_driving', 'abuse', 'harassment', 'overloading', 'unroadworthy', 'other'
  )),
  vehicle_plate text check (char_length(vehicle_plate) <= 15),
  route_id uuid references public.routes (id),
  operator_id uuid references public.operators (id),
  occurred_at timestamptz not null,
  location extensions.geography(Point, 4326),
  note text check (char_length(note) <= 1000),
  -- Storage paths in the report-photos bucket, each under the reporter's own folder.
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 3),
  status text not null default 'pending' check (status in ('pending', 'forwarded', 'closed', 'rejected')),
  forwarded_to text check (char_length(forwarded_to) <= 120),
  staff_note text check (char_length(staff_note) <= 1000),
  moderated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on column public.driver_reports.forwarded_to is 'Who staff sent it to, e.g. "MTTD Accra", "NRSA", "VIP Jeoun".';
create index driver_reports_status_idx on public.driver_reports (status, created_at desc);
create index driver_reports_user_idx on public.driver_reports (user_id, created_at desc);

create trigger driver_reports_rate_limit before insert on public.driver_reports
  for each row execute function public.enforce_report_rate_limit();

alter table public.driver_reports enable row level security;
create policy "driver_reports: add own" on public.driver_reports for insert to authenticated
  with check (
    user_id = (select auth.uid()) and status = 'pending' and forwarded_to is null and staff_note is null
    and public.has_agreed_terms()
    and not exists (select 1 from unnest(photo_paths) p where split_part(p, '/', 1) <> (select auth.uid())::text)
  );
create policy "driver_reports: read own or moderate" on public.driver_reports for select to authenticated
  using (user_id = (select auth.uid()) or public.can_moderate());

-- Staff record what they did with a report; nothing else about it can change.
create or replace function public.handle_driver_report(p_id uuid, p_status text, p_forwarded_to text, p_staff_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_moderate() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('forwarded', 'closed', 'rejected') then
    raise exception 'status must be forwarded, closed or rejected' using errcode = '22023';
  end if;
  if p_status = 'forwarded' and coalesce(btrim(p_forwarded_to), '') = '' then
    raise exception 'say who it was forwarded to' using errcode = '22023';
  end if;
  update public.driver_reports
     set status = p_status,
         forwarded_to = coalesce(nullif(btrim(p_forwarded_to), ''), forwarded_to),
         staff_note = nullif(btrim(p_staff_note), ''),
         moderated_by = auth.uid()
   where id = p_id;
  if not found then
    raise exception 'report % not found', p_id using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.handle_driver_report(uuid, text, text, text) from public, anon;
grant execute on function public.handle_driver_report(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Passenger ratings of the driver
-- ---------------------------------------------------------------------------

create table public.driver_ratings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  tags text[] not null default '{}' check (tags <@ array[
    'safe_driving', 'polite', 'clean_vehicle', 'on_time', 'fair_fare',
    'reckless', 'rude', 'dirty_vehicle', 'overloaded', 'overcharged'
  ]::text[]),
  vehicle_plate text check (char_length(vehicle_plate) <= 15),
  route_id uuid references public.routes (id),
  operator_id uuid references public.operators (id),
  comment text check (char_length(comment) <= 500),
  travelled_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index driver_ratings_operator_idx on public.driver_ratings (operator_id, created_at desc);

create trigger driver_ratings_rate_limit before insert on public.driver_ratings
  for each row execute function public.enforce_report_rate_limit();

alter table public.driver_ratings enable row level security;
create policy "driver_ratings: add own" on public.driver_ratings for insert to authenticated
  with check (user_id = (select auth.uid()) and public.has_agreed_terms());
create policy "driver_ratings: read own or moderate" on public.driver_ratings for select to authenticated
  using (user_id = (select auth.uid()) or public.can_moderate());

-- ---------------------------------------------------------------------------
-- Photo storage: private bucket; people upload into their own folder, staff read and delete
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "report-photos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'report-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "report-photos: read own or moderate" on storage.objects for select to authenticated
  using (bucket_id = 'report-photos' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.can_moderate()));
create policy "report-photos: moderators delete" on storage.objects for delete to authenticated
  using (bucket_id = 'report-photos' and public.can_moderate());

-- Photos of reports older than 90 days, for staff to delete through the Storage API
-- (deleting storage rows in SQL would leave the files behind).
create or replace function public.expired_report_photos()
returns table (report_id uuid, photo_paths text[])
language sql
stable
security definer
set search_path = ''
as $$
  select id, photo_paths from public.driver_reports
  where public.can_moderate() and cardinality(photo_paths) > 0 and created_at < now() - interval '90 days';
$$;

create or replace function public.forget_report_photos(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.can_moderate() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.driver_reports set photo_paths = '{}'
  where id = any (p_ids) and created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.expired_report_photos(), public.forget_report_photos(uuid[]) from public, anon;
grant execute on function public.expired_report_photos(), public.forget_report_photos(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Privacy: export and retention cover the new tables
-- ---------------------------------------------------------------------------

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
    'notifications', coalesce((select jsonb_agg(n order by n.created_at) from public.notifications n where n.user_id = auth.uid()), '[]'),
    'driver_reports', coalesce((select jsonb_agg(r order by r.created_at) from public.driver_reports r where r.user_id = auth.uid()), '[]'),
    'driver_ratings', coalesce((select jsonb_agg(r order by r.created_at) from public.driver_ratings r where r.user_id = auth.uid()), '[]')
  );
$$;

-- Driver reports and ratings: anonymised after 90 days, like the other reports.
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

  return result;
end;
$$;
