-- Standalone patch: US Only dual-backend support (Getatext / DaisySim server7).
-- Safe to run on its own and safe to re-run — every statement is guarded
-- with if not exists / if exists, matching the conventions in schema.sql.
-- Run this directly (rather than the full schema.sql) if re-running the
-- whole file stalls partway through on an unrelated earlier statement.

-- 1. daisysim_usa_config.backend — which provider fulfills "US Only" while enabled.
alter table public.daisysim_usa_config add column if not exists backend text not null default 'getatext';
alter table public.daisysim_usa_config drop constraint if exists daisysim_usa_config_backend_check;
alter table public.daisysim_usa_config add constraint daisysim_usa_config_backend_check
  check (backend in ('getatext', 'daisysim'));

-- 2. rentals — remembers which backend actually fulfilled each rental, plus
--    a dedicated activation-id column for the DaisySim server7 backend
--    (Getatext keeps using the existing daisysim_usa_activation_id column).
alter table public.rentals add column if not exists us_only_backend text;
alter table public.rentals drop constraint if exists rentals_us_only_backend_check;
alter table public.rentals add constraint rentals_us_only_backend_check
  check (us_only_backend is null or us_only_backend in ('getatext', 'daisysim'));
alter table public.rentals add column if not exists daisysim_server7_activation_id text;
create index if not exists rentals_daisysim_server7_activation_id_idx on public.rentals(daisysim_server7_activation_id);

-- 3. daisysim_usa_overrides — scoped per backend, since Getatext and DaisySim
--    server7 use separate service-code namespaces.
alter table public.daisysim_usa_overrides add column if not exists backend text not null default 'getatext';
alter table public.daisysim_usa_overrides drop constraint if exists daisysim_usa_overrides_backend_check;
alter table public.daisysim_usa_overrides add constraint daisysim_usa_overrides_backend_check
  check (backend in ('getatext', 'daisysim'));
alter table public.daisysim_usa_overrides drop constraint if exists daisysim_usa_overrides_service_code_key;
alter table public.daisysim_usa_overrides drop constraint if exists daisysim_usa_overrides_service_code_backend_key;
alter table public.daisysim_usa_overrides add constraint daisysim_usa_overrides_service_code_backend_key
  unique (service_code, backend);
