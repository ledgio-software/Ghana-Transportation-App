-- Reports are only accepted from users whose latest answer to both the terms and the privacy
-- notice is "yes" (Act 843 / Act 772). The app asks again when the document version changes.

create or replace function public.has_agreed_terms()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(count(*) = 2 and bool_and(granted), false)
  from (
    select distinct on (consent_type) consent_type, granted
    from public.consents
    where user_id = (select auth.uid()) and consent_type in ('terms', 'privacy')
    order by consent_type, created_at desc
  ) latest;
$$;

drop policy "fare_reports: add own" on public.fare_reports;
create policy "fare_reports: add own" on public.fare_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and public.has_agreed_terms());

drop policy "overcharge_reports: add own" on public.overcharge_reports;
create policy "overcharge_reports: add own" on public.overcharge_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and public.has_agreed_terms());

drop policy "hazard_reports: add own" on public.hazard_reports;
create policy "hazard_reports: add own" on public.hazard_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and public.has_agreed_terms());
