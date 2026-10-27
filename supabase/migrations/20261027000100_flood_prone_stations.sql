-- P1-WX-02: stations the field team marks as flood-prone get a stronger warning when heavy
-- rain is forecast there. save_station gains p_flood_prone (default false keeps old calls working).

alter table public.stations add column flood_prone boolean not null default false;
comment on column public.stations.flood_prone is 'Floods in heavy rain (e.g. Kwame Nkrumah Circle / Odaw). Set by the field team.';

drop function public.save_station(uuid, text, text, text, text, text, double precision, double precision, text, boolean);

-- Creates a station (p_id null) or updates one. Runs with the caller's rights,
-- so row level security decides who may save.
create function public.save_station(
  p_id uuid,
  p_name text,
  p_slug text,
  p_kind text,
  p_city text,
  p_region text,
  p_latitude double precision,
  p_longitude double precision,
  p_ghanapost_gps text default null,
  p_is_active boolean default true,
  p_flood_prone boolean default false
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
    insert into public.stations (name, slug, kind, city, region, location, ghanapost_gps, is_active, flood_prone)
    values (p_name, p_slug, p_kind, p_city, p_region, point, nullif(p_ghanapost_gps, ''), p_is_active, p_flood_prone)
    returning id into saved_id;
  else
    update public.stations
       set name = p_name, slug = p_slug, kind = p_kind, city = p_city, region = p_region,
           location = point, ghanapost_gps = nullif(p_ghanapost_gps, ''), is_active = p_is_active,
           flood_prone = p_flood_prone
     where id = p_id
    returning id into saved_id;
    if saved_id is null then
      raise exception 'station % not found or not editable', p_id using errcode = 'P0002';
    end if;
  end if;
  return saved_id;
end;
$$;

revoke execute on function public.save_station(uuid, text, text, text, text, text, double precision, double precision, text, boolean, boolean) from public, anon;
grant execute on function public.save_station(uuid, text, text, text, text, text, double precision, double precision, text, boolean, boolean) to authenticated;
