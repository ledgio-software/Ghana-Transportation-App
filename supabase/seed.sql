-- SAMPLE DATA for local development and the walking skeleton only.
-- Coordinates are approximate and fares come from the PRD examples, not from the verified
-- field dataset (Phase 0 doc section 4). Do not load this file into production.

insert into public.vehicle_types (code, name, sort_order) values
  ('trotro', 'Trotro', 10),
  ('shared_taxi', 'Shared taxi', 20),
  ('bus', 'Intercity bus', 30),
  ('ride_hailing', 'Uber / Bolt / Yango (estimate)', 40),
  ('flight', 'Domestic flight', 50)
on conflict (code) do nothing;

insert into public.operators (id, name, slug, kind) values
  ('00000000-0000-4000-8000-000000000101', 'VIP Jeoun', 'vip-jeoun', 'intercity_bus'),
  ('00000000-0000-4000-8000-000000000102', 'STC', 'stc', 'intercity_bus'),
  ('00000000-0000-4000-8000-000000000103', 'GPRTU', 'gprtu', 'trotro_union')
on conflict (id) do nothing;

insert into public.stations (id, name, slug, kind, city, region, location) values
  ('00000000-0000-4000-8000-000000000201', 'Kwame Nkrumah Circle', 'kwame-nkrumah-circle', 'lorry_station', 'Accra', 'Greater Accra',
    extensions.st_geogfromtext('POINT(-0.2166 5.5717)')),
  ('00000000-0000-4000-8000-000000000202', 'Kasoa', 'kasoa', 'lorry_station', 'Kasoa', 'Central',
    extensions.st_geogfromtext('POINT(-0.4170 5.5340)')),
  ('00000000-0000-4000-8000-000000000203', 'Fadama', 'fadama', 'stop', 'Accra', 'Greater Accra',
    extensions.st_geogfromtext('POINT(-0.2400 5.5900)')),
  ('00000000-0000-4000-8000-000000000204', 'Asafo (Kumasi)', 'asafo-kumasi', 'bus_terminal', 'Kumasi', 'Ashanti',
    extensions.st_geogfromtext('POINT(-1.6160 6.6860)')),
  ('00000000-0000-4000-8000-000000000205', 'Kejetia', 'kejetia', 'lorry_station', 'Kumasi', 'Ashanti',
    extensions.st_geogfromtext('POINT(-1.6240 6.6950)'))
on conflict (id) do nothing;

-- Circle sits on the Odaw drain and floods in heavy rain (sample flag for the weather warning).
update public.stations set flood_prone = true where id = '00000000-0000-4000-8000-000000000201';

insert into public.routes (id, origin_station_id, destination_station_id, kind, corridor, typical_duration_min) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000202', 'intracity', null, 60),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000203', 'intracity', null, 20),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000204', 'intercity', 'N6', 300)
on conflict (id) do nothing;

insert into public.fare_sources (id, kind, name, reference_url, document_date) values
  ('00000000-0000-4000-8000-000000000401', 'official_gprtu', 'GPRTU fares cited in PRD (sample)', null, '2026-06-01'),
  ('00000000-0000-4000-8000-000000000402', 'operator_list', 'VIP Jeoun fare change, Graphic Online (sample)', null, '2026-04-08')
on conflict (id) do nothing;

insert into public.fares (route_id, operator_id, vehicle_type, class, amount_pesewas, is_official, source_id, departure_mode, first_departure, last_departure) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000103', 'trotro', 'standard', 1100, true,
    '00000000-0000-4000-8000-000000000401', 'fill_and_go', '05:00', '21:00'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000103', 'trotro', 'standard', 500, true,
    '00000000-0000-4000-8000-000000000401', 'fill_and_go', '05:00', '22:00'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000101', 'bus', 'executive', 15000, true,
    '00000000-0000-4000-8000-000000000402', 'fill_and_go', '04:00', '22:00'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000101', 'bus', 'standard', 12000, true,
    '00000000-0000-4000-8000-000000000402', 'fill_and_go', '04:00', '22:00')
on conflict do nothing;

insert into public.hazard_zones (name, corridor, kind, geom, alert_radius_m, severity, description) values
  ('Sample hotspot (placeholder)', 'N6', 'crash_hotspot',
    extensions.st_geogfromtext('POINT(-0.3530 5.8080)'), 1500, 3,
    'Placeholder until NRSA hotspot data and the field drive-through are in.');

insert into public.app_versions (platform, min_supported, latest) values
  ('android', '0.1.0', '0.1.0'),
  ('ios', '0.1.0', '0.1.0'),
  ('web', '0.1.0', '0.1.0')
on conflict (platform) do nothing;

-- Phase 2 to 4 features are reserved behind switches that stay off until their phase.
insert into public.feature_flags (key, description, enabled) values
  ('phase1.fare_reports', 'Crowd fare reports after a trip (P1-REPORT)', true),
  ('phase1.hazard_radar', 'N6 hazard radar audio alerts (P1-HAZ)', false),
  ('phase2.safety_circle', 'Family tracking and SOS (Phase 2)', false),
  ('phase3.booking', 'MoMo seat booking (Phase 3)', false),
  ('phase4.station_queue', 'Station queue tools (Phase 4)', false)
on conflict (key) do nothing;
