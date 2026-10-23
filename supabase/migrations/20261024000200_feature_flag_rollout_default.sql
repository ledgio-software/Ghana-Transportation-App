-- A switch that is turned on should reach everyone unless a rollout percentage is set,
-- so the default rollout becomes 100% (the app treats 0% as nobody).
alter table public.feature_flags alter column rollout_percent set default 100;
comment on column public.feature_flags.rollout_percent is
  'Share of devices (by stable bucket 0-99) that get the feature when enabled. 100 = everyone.';
