-- NexaVerify — Supabase schema
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Safe to re-run: everything is guarded with IF NOT EXISTS / OR REPLACE.

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ============================================================================
-- profiles: one row per auth.users row. Holds role + wallet balance.
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text,                     -- what customers actually log in with (see below)
  role text not null default 'customer' check (role in ('customer', 'admin')),
  balance numeric(12,2) not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);

-- Backfills the username column without touching existing data if you
-- already ran an earlier version of this file. Existing accounts (created
-- before this column existed) simply have username = null until you set one
-- by hand in Table Editor — they won't be able to log in with a username
-- until then, only with whatever auth method they used to sign up.
alter table public.profiles add column if not exists username text;

-- Legacy: used to permanently suppress the welcome/onboarding popup after
-- the first dismissal. No longer read by the app (see onboarding_muted_until
-- below for the current behavior) — left in place rather than dropped so no
-- destructive migration is needed. Safe to ignore.
alter table public.profiles add column if not exists onboarding_seen_at timestamptz;

-- Current onboarding-popup suppression (see public.onboarding_config,
-- components/WelcomeModal.js): the popup now shows on EVERY dashboard visit
-- by default. The one way to suppress it is the popup's own "Mute for 24h"
-- button (see app/api/onboarding/mute), which sets this to now + 24h. Null,
-- or any timestamp in the past, means "show it." A plain X/"Get Started"
-- close is intentionally NOT persisted anywhere — it only dismisses for that
-- page load, so it shows again on the next dashboard visit.
alter table public.profiles add column if not exists onboarding_muted_until timestamptz;

-- Case-insensitive uniqueness ("Alice" and "alice" can't both exist), but
-- deliberately allows any number of NULLs (old accounts without a username
-- set yet don't block each other or new signups).
create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- No client-side insert/update policy on purpose: profile creation happens
-- via the trigger below, and balance/role changes only happen through
-- server-side Route Handlers using the service role key (adjust_balance()).

-- Auto-create a profile row whenever someone signs up. The username comes
-- from the `data: { username }` option passed to supabase.auth.signUp() in
-- app/api/auth/signup/route.js, which lands in auth.users.raw_user_meta_data.
-- The API route already checks username uniqueness before calling signUp,
-- but if a race condition somehow slips a duplicate through, this catches
-- the unique-index violation and creates the profile WITHOUT a username
-- rather than failing the whole signup (which would otherwise leave a
-- broken, unrecoverable auth.users row with no matching profile).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (id, email, username)
    values (new.id, new.email, new.raw_user_meta_data->>'username')
    on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do nothing;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- services: local cache of DaisySMS services + the admin's on/off switch and
-- resale price. NexaVerify is priced in Naira (NGN) for customers, while
-- DaisySMS itself bills in USD — so this table tracks BOTH numbers per
-- service:
--   last_price      = DaisySMS's own cost, in USD, from getPricesVerification
--   customer_price  = what NexaVerify actually charges the customer, in NGN,
--                      set by hand on the admin Products page. Not derived
--                      from last_price automatically — admin sets the margin.
-- A service with enabled=true but customer_price still null is NOT
-- purchasable yet (see app/api/rentals/buy/route.js) — admin has to price it
-- first.
-- ============================================================================
create table if not exists public.services (
  id text primary key,               -- DaisySMS service shortcode, e.g. "wa", "go", "ds"
  name text not null,                -- human-readable name shown to customers
  enabled boolean not null default false, -- admin toggle — OFF by default until reviewed
  last_price numeric(12,2),          -- DaisySMS's own cost in USD, from getPricesVerification
  customer_price numeric(12,2),      -- what customers pay, in NGN — set by admin, null = unpriced
  last_count integer,                -- most recent "numbers available" count
  last_synced_at timestamptz,
  auto_markup boolean not null default false, -- if true, every services/sync recomputes
                                               -- customer_price as cost(NGN) + markup_amount
  markup_amount numeric(12,2),       -- the NGN margin to keep applying on top of DaisySMS's
                                      -- cost when auto_markup is on (or was last used manually)
  favorite boolean not null default false,    -- pinned to the top of /admin/products
  created_at timestamptz not null default now()
);

-- If you already ran an earlier version of this file, these backfill the
-- newer columns without touching existing data.
alter table public.services add column if not exists customer_price numeric(12,2);
alter table public.services add column if not exists auto_markup boolean not null default false;
alter table public.services add column if not exists markup_amount numeric(12,2);
alter table public.services add column if not exists favorite boolean not null default false;

alter table public.services enable row level security;

drop policy if exists "services_select_all" on public.services;
create policy "services_select_all" on public.services
  for select using (true);

-- ============================================================================
-- daisysms_config: master on/off switch for the whole DaisySMS provider (the
-- "USA & Canada" catalog — public.services). Unlike DaisySim, DaisySMS has
-- no other site-wide setting to store (pricing is per-service on
-- public.services itself), so this is deliberately a single boolean rather
-- than folded into another table — see app/admin/providers and
-- app/api/rentals/buy. Off by default is NOT the default here (unlike
-- daisysim_config) since DaisySMS is the original, already-live provider —
-- defaults to enabled=true so existing installs aren't silently broken by
-- re-running this file.
-- ============================================================================
create table if not exists public.daisysms_config (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.daisysms_config (id) values (true) on conflict (id) do nothing;

alter table public.daisysms_config enable row level security;

drop policy if exists "daisysms_config_select_all" on public.daisysms_config;
create policy "daisysms_config_select_all" on public.daisysms_config
  for select using (true);

-- No client insert/update policy on purpose — only
-- /api/admin/providers/config (service role key) writes this.

-- ============================================================================
-- daisysim_config: site-wide settings for the DaisySim provider (see
-- lib/daisysim.js). Unlike DaisySMS's public.services catalog — where an
-- admin pre-syncs and prices each service individually — DaisySim is
-- country+service scoped with live, 5-minute-expiring price tiers, so there's
-- nothing to pre-price per product. Instead there's one global flat-NGN
-- markup applied on top of the live USD tier price at purchase time, and one
-- on/off switch for the whole flow. Deliberately a single-row table (id
-- always true) rather than per-service rows — see app/admin/international.
-- ============================================================================
create table if not exists public.daisysim_config (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  markup_amount_ngn numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.daisysim_config (id) values (true) on conflict (id) do nothing;

alter table public.daisysim_config enable row level security;

drop policy if exists "daisysim_config_select_all" on public.daisysim_config;
create policy "daisysim_config_select_all" on public.daisysim_config
  for select using (true);

-- No client insert/update policy on purpose — only
-- /api/admin/international/config (service role key) writes this.

-- ============================================================================
-- daisysim_overrides: per country+service admin overrides for the
-- International Numbers catalog (see app/admin/international ->
-- InternationalOverridesManager). Unlike public.services (DaisySMS's
-- pre-synced, individually-priced catalog), DaisySim has no local catalog at
-- all — countries/services are fetched live from their API every time (see
-- lib/daisysim.js getCountries/getServicesForCountry) and prices are
-- live/expiring tiers that can't be manually overridden. What CAN be
-- overridden per country+service combo, mirroring the favorite/enabled
-- controls on DaisySMS's Products page:
--   favorite: pins this combo to the top of the customer's service list for
--     that country (see app/api/international/services).
--   disabled: hides this combo entirely from customers and blocks purchase
--     server-side (see app/api/international/buy), without touching the
--     global on/off switch in daisysim_config.
-- Rows are created lazily — only combos an admin has actually touched exist
-- here at all; everything else defaults to "not favorited, not disabled".
-- ============================================================================
create table if not exists public.daisysim_overrides (
  id uuid primary key default gen_random_uuid(),
  country_id text not null,
  country_name text not null,
  service_code text not null,
  service_name text not null,
  favorite boolean not null default false,
  disabled boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (country_id, service_code)
);

create index if not exists daisysim_overrides_country_idx on public.daisysim_overrides(country_id);

alter table public.daisysim_overrides enable row level security;

drop policy if exists "daisysim_overrides_select_all" on public.daisysim_overrides;
create policy "daisysim_overrides_select_all" on public.daisysim_overrides
  for select using (true);

-- No client insert/update policy on purpose — only
-- /api/admin/international/overrides (service role key) writes this.

-- ============================================================================
-- daisysim_usa_config: site-wide settings for the "US Only" provider (see
-- lib/getatext.js) — a THIRD, separate phone-number provider alongside
-- DaisySMS (USA & Canada) and the "All countries" DaisySim product above.
-- Table/column names still say "daisysim_usa" for historical reasons (this
-- product used to be backed by DaisySim's server7 API before switching to
-- Getatext) — purely internal, never shown to customers, not worth the
-- migration risk to rename.
-- Despite the similar name this is a different API/product line on
-- DaisySim's side (their "server7" base path, USA-only, flat catalog with
-- prices already attached — no country picker, no price tiers). Same
-- singleton-row pattern as daisysim_config: one on/off switch, one flat-NGN
-- markup applied on top of the live USD price at purchase time. Off by
-- default — new opt-in provider, see app/admin/us-only.
-- ============================================================================
create table if not exists public.daisysim_usa_config (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  markup_amount_ngn numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.daisysim_usa_config (id) values (true) on conflict (id) do nothing;

alter table public.daisysim_usa_config enable row level security;

drop policy if exists "daisysim_usa_config_select_all" on public.daisysim_usa_config;
create policy "daisysim_usa_config_select_all" on public.daisysim_usa_config
  for select using (true);

-- No client insert/update policy on purpose — only
-- /api/admin/us-only/config (service role key) writes this.

-- ============================================================================
-- daisysim_usa_overrides: per-service admin overrides for the "US Only"
-- catalog (see app/admin/us-only -> UsOnlyOverridesManager). No country
-- dimension needed here (unlike daisysim_overrides) since this provider is
-- USA-only — one row per service code. Same favorite/disabled semantics as
-- every other catalog override table in this schema:
--   favorite: pins this service to the top of the customer's list (see
--     app/api/us-only/services or lib/usOnlyCatalog.js).
--   disabled: hides this service entirely from customers and blocks
--     purchase server-side (see app/api/us-only/buy), without touching the
--     global on/off switch in daisysim_usa_config.
-- Rows are created lazily — only services an admin has actually touched
-- exist here at all.
-- ============================================================================
create table if not exists public.daisysim_usa_overrides (
  id uuid primary key default gen_random_uuid(),
  service_code text not null unique,
  service_name text not null,
  favorite boolean not null default false,
  disabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Per-service markup override (see app/admin/us-only ->
-- UsOnlyOverridesManager, rebuilt to mirror /admin/products' per-product
-- price control). NULL (the default — no backfill needed) means "no
-- per-service override yet, keep inheriting daisysim_usa_config's single
-- global markup_amount_ngn" — this is what every existing service was
-- already effectively priced at before this column existed, so adding it
-- doesn't change anyone's live price until an admin explicitly sets one.
-- Once set (even to the same number the global default already was), that
-- service's price is computed from THIS value instead, independently of the
-- global default from then on. Both lib/usOnlyCatalog.js (customer-facing
-- price) and app/api/us-only/buy/route.js (the actual charge) resolve
-- effective markup the same way: override.markup_ngn ?? config's global
-- markup_amount_ngn.
alter table public.daisysim_usa_overrides add column if not exists markup_ngn numeric(12,2);

alter table public.daisysim_usa_overrides enable row level security;

drop policy if exists "daisysim_usa_overrides_select_all" on public.daisysim_usa_overrides;
create policy "daisysim_usa_overrides_select_all" on public.daisysim_usa_overrides
  for select using (true);

-- No client insert/update policy on purpose — only
-- /api/admin/us-only/overrides (service role key) writes this.

-- ============================================================================
-- istar_config: site-wide settings for Telegram Stars/Premium gifting (see
-- lib/istar.js). Not a phone-number provider at all — genuinely different
-- shape: it spends TON/USDT from your OWN iStar developer wallet to gift
-- Telegram Stars or Telegram Premium to a username. Two separate flags,
-- deliberately not one:
--   enabled: gates whether an admin can place a (real, wallet-charging) test
--     order at all — flip it once ISTAR_API_KEY is set up and you're ready
--     to start testing. An admin can always reach the real buy flow at
--     /products/telegram-premium regardless of customer_visible below.
--   customer_visible: a SECOND, separate switch — off by default — for
--     whether regular customers see the real buy flow too (billed from
--     their own wallet) instead of a plain "Coming soon" placeholder. Meant
--     to be flipped on only once you've tested the flow yourself with
--     `enabled`. See app/(customer)/products/telegram-premium/page.js.
--   ngn_per_star: iStar has no live pre-purchase price lookup for star
--     gifting (unlike premium, which has /premium/packages) — the `amount`
--     for a star order only appears in iStar's OWN order-creation response,
--     after the fact. This is the FALLBACK flat price PER SINGLE STAR, used
--     only until the system has learned a real cost (see star_last_cost_ngn
--     below) — total charged = quantity x this value.
--   "Old way" and "New way" are two INDEPENDENT, fully-configured markup
--     profiles — each has its own ×/+ calculation operator AND its own
--     under-1,000 / 1,000+ markup amounts. Either profile can use either
--     operator; they aren't locked to "Old = ×, New = +" anymore (that was
--     the first version of this and confused the business owner, who wanted
--     to be able to change the CALCULATION on either profile independently
--     without touching the other one's numbers).
--   star_pricing_mode: 'per_star' means "Old way" profile is what's actually
--     charged, 'flat' means "New way" is. Switching this doesn't clear or
--     touch either profile's saved operator/markups.
--   star_old_way_operator / star_new_way_operator: 'times' or 'plus' — the
--     calculation for that profile:
--       'times': order total = (base cost per star + markup) x quantity
--       'plus':  order total = (base cost per star x quantity) + markup
--   star_markup_under_1000_ngn / star_markup_1000_plus_ngn: "Old way"
--     profile's markup amount for each quantity tier.
--   star_flat_markup_under_1000_ngn / star_flat_markup_1000_plus_ngn: "New
--     way" profile's markup amount for each quantity tier. (Column names
--     kept from before the ×/+ toggle existed — "flat" no longer implies a
--     fixed operator, since New way can now be set to 'times' too.)
--   Both profiles pick their under/over-1000 variant the same way: by the
--     REQUESTED QUANTITY on that specific order (< 1000 vs >= 1000). Base
--     cost per star is star_last_cost_ngn once learned, else ngn_per_star.
--     See lib/istar-pricing.js#computeStarTotalPrice (charges whichever
--     profile star_pricing_mode selects) and #computeStarTotalPriceForWay
--     (computes either profile on demand regardless of which is live, used
--     to show both side by side in admin).
--   star_markup_ngn: superseded by everything above — no longer written to,
--     kept only so an old row doesn't break on read.
--   star_last_cost_ngn / star_last_cost_wallet_type / star_last_cost_updated_at:
--     self-learning cost tracking. Every time a star order actually
--     completes AND was paid from the USDT-on-TON wallet (USDT is pegged
--     ~1:1 to USD, so it converts to NGN reliably via currency_rates — TON
--     orders are skipped here since there's no TON->NGN rate anywhere in
--     this app), app/api/telegram/webhook and .../orders/[id]/status compute
--     (amount charged / quantity) x currency_rates.USD and store it here.
--     The NEXT star purchase (by anyone — admin or customer) then prices off
--     THIS learned number + star_markup_ngn instead of the static fallback.
--   premium_markup_3 / premium_markup_6 / premium_markup_12: flat NGN margin
--     added on top of THAT specific duration's live usd_value (from
--     getPremiumPackages()) x your currency_rates USD rate — set separately
--     per duration since iStar's own cost per month isn't linear. Re-fetched
--     live at purchase time every time (see app/api/telegram/premium/buy),
--     so raising iStar's own price never silently eats your markup.
--   markup_amount_ngn: superseded by the columns above — no longer written
--     to, kept only so an old row doesn't break on read.
-- ============================================================================
create table if not exists public.istar_config (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  customer_visible boolean not null default false,
  ngn_per_star numeric(12,4) not null default 0,
  markup_amount_ngn numeric(12,2) not null default 0,
  star_markup_ngn numeric(12,4) not null default 0,
  star_pricing_mode text not null default 'flat' check (star_pricing_mode in ('per_star', 'flat')),
  star_old_way_operator text not null default 'times' check (star_old_way_operator in ('times', 'plus')),
  star_new_way_operator text not null default 'plus' check (star_new_way_operator in ('times', 'plus')),
  star_markup_under_1000_ngn numeric(12,4) not null default 0,
  star_markup_1000_plus_ngn numeric(12,4) not null default 0,
  star_flat_markup_under_1000_ngn numeric(12,2) not null default 0,
  star_flat_markup_1000_plus_ngn numeric(12,2) not null default 0,
  star_last_cost_ngn numeric(12,4),
  star_last_cost_wallet_type text,
  star_last_cost_updated_at timestamptz,
  -- Diagnostic trail — written on EVERY completed star order, whether or not
  -- learning actually succeeded, so a failure to learn is always visible
  -- somewhere instead of silently vanishing (see lib/istar.js#learnStarCostFromOrder).
  -- star_last_cost_ngn/wallet_type/updated_at above only ever change on a
  -- successful learn; these track the most recent ATTEMPT, success or not.
  star_learn_last_attempt_at timestamptz,
  star_learn_last_status text,        -- 'learned' | 'skipped_no_amount' | 'skipped_no_rate' | 'skipped_invalid'
  star_learn_last_raw_amount numeric(14,4),
  star_learn_last_raw_quantity integer,
  star_learn_last_wallet_type text,
  star_learn_last_note text,
  premium_markup_3 numeric(12,2) not null default 0,
  premium_markup_6 numeric(12,2) not null default 0,
  premium_markup_12 numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.istar_config add column if not exists customer_visible boolean not null default false;
alter table public.istar_config add column if not exists premium_markup_3 numeric(12,2) not null default 0;
alter table public.istar_config add column if not exists premium_markup_6 numeric(12,2) not null default 0;
alter table public.istar_config add column if not exists premium_markup_12 numeric(12,2) not null default 0;
alter table public.istar_config add column if not exists star_markup_ngn numeric(12,4) not null default 0;
alter table public.istar_config add column if not exists star_pricing_mode text not null default 'flat';
-- Guard added separately so re-running this file doesn't error if the check
-- already exists.
do $$ begin
  alter table public.istar_config add constraint istar_config_star_pricing_mode_check check (star_pricing_mode in ('per_star', 'flat'));
exception when duplicate_object then null;
end $$;
-- Defaults preserve current behavior for existing rows: Old way keeps
-- calculating with × (as it always has), New way keeps calculating with +
-- (as it always has) — this migration only makes each one independently
-- switchable going forward, it doesn't change anyone's live pricing today.
alter table public.istar_config add column if not exists star_old_way_operator text not null default 'times';
alter table public.istar_config add column if not exists star_new_way_operator text not null default 'plus';
do $$ begin
  alter table public.istar_config add constraint istar_config_star_old_way_operator_check check (star_old_way_operator in ('times', 'plus'));
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.istar_config add constraint istar_config_star_new_way_operator_check check (star_new_way_operator in ('times', 'plus'));
exception when duplicate_object then null;
end $$;
alter table public.istar_config add column if not exists star_markup_under_1000_ngn numeric(12,4) not null default 0;
alter table public.istar_config add column if not exists star_markup_1000_plus_ngn numeric(12,4) not null default 0;
-- These two are FLAT amounts, added once to the whole order — not scaled by
-- quantity the way the two columns above were, so intentionally NOT
-- backfilled from them (a per-star value like ₦100 and a flat value like
-- ₦1,000 aren't the same number just relabeled — re-enter these by hand in
-- admin settings after this migration runs).
alter table public.istar_config add column if not exists star_flat_markup_under_1000_ngn numeric(12,2) not null default 0;
alter table public.istar_config add column if not exists star_flat_markup_1000_plus_ngn numeric(12,2) not null default 0;
alter table public.istar_config add column if not exists star_last_cost_ngn numeric(12,4);
alter table public.istar_config add column if not exists star_last_cost_wallet_type text;
alter table public.istar_config add column if not exists star_last_cost_updated_at timestamptz;
alter table public.istar_config add column if not exists star_learn_last_attempt_at timestamptz;
alter table public.istar_config add column if not exists star_learn_last_status text;
alter table public.istar_config add column if not exists star_learn_last_raw_amount numeric(14,4);
alter table public.istar_config add column if not exists star_learn_last_raw_quantity integer;
alter table public.istar_config add column if not exists star_learn_last_wallet_type text;
alter table public.istar_config add column if not exists star_learn_last_note text;

insert into public.istar_config (id) values (true) on conflict (id) do nothing;

alter table public.istar_config enable row level security;

drop policy if exists "istar_config_select_all" on public.istar_config;
create policy "istar_config_select_all" on public.istar_config
  for select using (true);

-- No client insert/update policy on purpose — only
-- /api/admin/telegram-premium/config (service role key) writes this.

-- ============================================================================
-- telegram_gift_orders: every Telegram Stars/Premium order ever placed via
-- iStar (see lib/istar.js, app/api/telegram/*). user_id is whoever placed
-- it — an admin testing, or (once istar_config.customer_visible is on) a
-- real customer, same table either way.
--   refunded_at: same idempotent-refund-claim pattern as rentals.refunded_at
--     — set the instant a failed order's charge is refunded, and used as an
--     atomic UPDATE...WHERE refunded_at IS NULL guard so the webhook and a
--     manual status poll can never both refund the same order.
-- ============================================================================
create table if not exists public.telegram_gift_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_type text not null check (order_type in ('star', 'premium')),
  istar_order_id text unique,
  recipient_username text not null,
  recipient_hash text,
  quantity integer,                   -- stars only
  months integer,                     -- premium only (3, 6, or 12)
  price numeric(12,2) not null,       -- what the buyer was actually charged, in NGN
  provider_amount numeric(14,4),      -- iStar's own `amount` — in wallet_type's currency
  wallet_type text not null default 'TON' check (wallet_type in ('TON', 'USDT')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  tx_hash text,
  error_message text,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_gift_orders_user_id_idx on public.telegram_gift_orders(user_id);
create index if not exists telegram_gift_orders_istar_order_id_idx on public.telegram_gift_orders(istar_order_id);
create index if not exists telegram_gift_orders_pending_idx on public.telegram_gift_orders(created_at) where status in ('pending', 'processing');

alter table public.telegram_gift_orders enable row level security;

drop policy if exists "telegram_gift_orders_select_own" on public.telegram_gift_orders;
create policy "telegram_gift_orders_select_own" on public.telegram_gift_orders
  for select using (auth.uid() = user_id);

-- No client insert/update policy on purpose — only the service-role admin
-- routes under app/api/telegram/* and the webhook write this.

-- ============================================================================
-- social_boost_config: site-wide settings for "Social Boost" — the SMM panel
-- (followers/likes/views/comments) at thelordofthepanels.com (see
-- lib/socialboost.js). Same two-switch shape as istar_config:
--   enabled: admin's own access to place TEST orders from /admin/social-boost
--     (and, for a real customer, the actual buy flow) — always available to
--     admins regardless of customer_visible.
--   customer_visible: separate, off-by-default switch. Customers always see
--     "Coming soon" on /products/social-boost until this is flipped on.
-- Unlike iStar, there's no admin-set markup here — every service's `rate`
-- (price per 1000 units) comes straight from the provider's live /services
-- list; NexaVerify isn't reselling with its own markup on this provider yet.
-- ============================================================================
create table if not exists public.social_boost_config (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  customer_visible boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.social_boost_config (id) values (true) on conflict (id) do nothing;

alter table public.social_boost_config enable row level security;

drop policy if exists "social_boost_config_select_all" on public.social_boost_config;
create policy "social_boost_config_select_all" on public.social_boost_config
  for select using (true);

-- No client insert/update policy on purpose — only
-- /api/admin/social-boost/config (service role key) writes this.

-- ============================================================================
-- social_boost_orders: every Social Boost order ever placed (currently
-- admin-only test orders — see app/api/admin/social-boost/orders). user_id is
-- whoever placed it, same table for a future real customer purchase once
-- social_boost_config.customer_visible is turned on.
--   provider_order_id: the panel's own numeric order id, used for every
--     status/refill/cancel lookup afterward.
--   status/remains/start_count/charge: the panel's own status fields,
--     refreshed on demand (no webhook — this panel is poll-only) via
--     app/api/admin/social-boost/orders/[id]/refresh.
-- ============================================================================
create table if not exists public.social_boost_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider_order_id text not null,
  service_id integer not null,
  service_name text,
  link text not null,
  quantity integer not null,
  runs integer,
  interval_minutes integer,
  price_ngn numeric(12,2),            -- what the buyer was actually charged, in NGN
  charge numeric(14,4),                -- the provider's own charge, in `currency` (USD)
  currency text,
  start_count integer,
  remains integer,
  status text not null default 'Pending',
  refill_id text,
  refill_status text,
  cancel_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_boost_orders_user_id_idx on public.social_boost_orders(user_id);
create index if not exists social_boost_orders_provider_order_id_idx on public.social_boost_orders(provider_order_id);

alter table public.social_boost_orders enable row level security;

drop policy if exists "social_boost_orders_select_own" on public.social_boost_orders;
create policy "social_boost_orders_select_own" on public.social_boost_orders
  for select using (auth.uid() = user_id);

-- No client insert/update policy on purpose — only the service-role admin
-- routes under app/api/admin/social-boost/* write this.

-- ============================================================================
-- social_boost_overrides: per-service admin overrides for the Social Boost
-- catalog (see app/admin/social-boost -> SocialBoostCatalogManager), same
-- favorite/enabled/markup semantics as every other catalog override table in
-- this schema. service_id IS the provider's own numeric service id — used
-- directly as the primary key since it's already unique and stable, no
-- surrogate uuid needed.
--   enabled: hides this service entirely from customers and blocks purchase
--     server-side (see app/api/social-boost/orders), without touching the
--     global on/off switch in social_boost_config.
--   favorite: pins this service to the top of its platform tab for customers
--     (see app/api/social-boost/services).
--   markup_ngn: a FLAT Naira amount added once per order for this specific
--     service — set in bulk for many services at once ("Markup" button,
--     replaces whatever was there before, doesn't add on top of it — same
--     behavior as /admin/products' bulk Markup) or edited individually
--     afterward. Defaults to 0 (no markup) until an admin sets one; there's
--     no live per-service cost lookup to compute a percentage from the way
--     DaisySMS's sync does, so this is deliberately a flat admin-set amount.
-- Rows are created lazily — only services an admin has actually touched
-- exist here at all.
-- ============================================================================
create table if not exists public.social_boost_overrides (
  service_id integer primary key,
  service_name text,
  enabled boolean not null default true,
  favorite boolean not null default false,
  markup_ngn numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- markup_type / markup_percent: added so the bulk "Markup" control on
-- /admin/social-boost can apply a PERCENTAGE markup instead of the flat
-- markup_ngn amount above — a toggle button next to that control switches
-- which one a bulk run writes. When markup_type = 'percent', pricing (see
-- app/api/social-boost/orders and app/api/social-boost/services) computes
-- the order's markup as markup_percent% of that order's own USD->NGN cost
-- (so, unlike markup_ngn, it naturally scales with quantity) and ignores
-- markup_ngn entirely; markup_ngn is left at whatever it was (unused, not
-- zeroed) purely so switching back to flat later doesn't lose the old
-- number. Saving an individual row's flat ₦ field (SocialBoostServiceRow)
-- always resets a service back to markup_type = 'flat', since typing a flat
-- number into that field is an explicit choice to stop using a percentage.
alter table public.social_boost_overrides add column if not exists markup_type text not null default 'flat';
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'social_boost_overrides_markup_type_check'
  ) then
    alter table public.social_boost_overrides
      add constraint social_boost_overrides_markup_type_check check (markup_type in ('flat', 'percent'));
  end if;
end $$;
alter table public.social_boost_overrides add column if not exists markup_percent numeric(6,2) not null default 0;

alter table public.social_boost_overrides enable row level security;

drop policy if exists "social_boost_overrides_select_all" on public.social_boost_overrides;
create policy "social_boost_overrides_select_all" on public.social_boost_overrides
  for select using (true);

-- No client insert/update policy on purpose — only
-- /api/admin/social-boost/overrides/* (service role key) writes this.

-- ============================================================================
-- rentals: every phone number ever purchased through NexaVerify.
-- is_long_term flags the ones the admin's "Long-term numbers" page tracks.
-- ============================================================================
create table if not exists public.rentals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  daisy_id text,                      -- the $ID from DaisySMS getNumber — null for provider='daisysim'
  service_id text references public.services(id), -- DaisySMS catalog row — null for provider='daisysim'
  phone_number text not null,
  price numeric(12,2) not null,       -- what the customer was actually charged, in NGN
  cost_usd numeric(12,2),             -- what the provider actually charged NexaVerify, in USD (margin tracking)
  status text not null default 'waiting'
    check (status in ('waiting', 'received', 'cancelled', 'done', 'expired')),
  is_long_term boolean not null default false,
  sms_code text,
  full_text text,
  expires_at timestamptz,
  -- LTR-specific fields, kept in sync from DaisySMS's GET /api/ltrs via the
  -- admin "Sync LTRs" action (see lib/daisy.js getLtrs() and
  -- app/api/admin/rentals/sync-ltrs/route.js). Null/false until synced.
  -- DaisySim has no long-term-rental concept, so these stay null there.
  daily_price numeric(12,2),
  auto_renew boolean not null default false,
  renewable boolean not null default true,
  paid_until timestamptz,
  period_duration integer,
  period_type text check (period_type in ('H', 'D', 'M')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If you already ran an earlier version of this file (before LTR/pricing
-- fields existed), this backfills the new columns without touching existing data.
alter table public.rentals add column if not exists daily_price numeric(12,2);
alter table public.rentals add column if not exists auto_renew boolean not null default false;
alter table public.rentals add column if not exists renewable boolean not null default true;
alter table public.rentals add column if not exists paid_until timestamptz;
alter table public.rentals add column if not exists period_duration integer;
alter table public.rentals add column if not exists period_type text;
alter table public.rentals add column if not exists cost_usd numeric(12,2);

-- ----------------------------------------------------------------------------
-- DaisySim support (second phone-number provider, added alongside DaisySMS —
-- see lib/daisysim.js). DaisySim is country+service scoped with live,
-- expiring price tiers rather than a pre-synced catalog like public.services,
-- so its rentals carry their own denormalized country/service labels instead
-- of an FK into services. daisy_id/service_id above had to become nullable
-- since a DaisySim rental has neither.
-- ----------------------------------------------------------------------------
alter table public.rentals alter column daisy_id drop not null;
alter table public.rentals alter column service_id drop not null;
alter table public.rentals add column if not exists provider text not null default 'daisysms'
  check (provider in ('daisysms', 'daisysim'));
alter table public.rentals add column if not exists daisysim_activation_id text;
alter table public.rentals add column if not exists country_name text;
alter table public.rentals add column if not exists service_code text;
alter table public.rentals add column if not exists service_name text;

-- ----------------------------------------------------------------------------
-- "US Only" support (third phone-number provider — see lib/daisysimUsa.js).
-- Widens the provider check constraint to allow 'daisysim_usa' alongside the
-- existing two, and gives it its own activation-id column so it never
-- collides with daisysim_activation_id above (the two are different APIs
-- with their own ID namespaces on DaisySim's side).
-- ----------------------------------------------------------------------------
alter table public.rentals drop constraint if exists rentals_provider_check;
alter table public.rentals add constraint rentals_provider_check
  check (provider in ('daisysms', 'daisysim', 'daisysim_usa'));
alter table public.rentals add column if not exists daisysim_usa_activation_id text;

-- ----------------------------------------------------------------------------
-- 3-minute no-code timeout (both providers) — see
-- app/api/admin/rentals/sweep-timeouts and app/api/rentals/cancel.
--   refunded_at: set the instant a refund is actually issued for this
--     rental, and used as an atomic claim guard (UPDATE ... WHERE
--     refunded_at IS NULL) so a manual cancel racing the timeout sweep can
--     NEVER both refund the same rental — whichever request's UPDATE
--     actually matches a row is the only one that calls adjust_balance().
--   cancel_error: last provider-cancel error, for admin visibility only, when
--     the sweep couldn't cancel on the provider (network hiccup, etc.) and
--     left the rental as 'waiting' for the next run to retry. Cleared once a
--     retry succeeds. ALSO used (with a fixed explanatory string) when a
--     provider confirmed a cancel but explicitly did NOT confirm a refund —
--     see refund_denied_by_provider below.
--   refund_denied_by_provider: true when daisysim/daisysim_usa's own
--     /cancel response came back with `refund: false` (or equivalent) —
--     i.e. the provider itself declined to refund NexaVerify's master
--     balance for this cancellation. In that case the rental is marked
--     'cancelled' but refunded_at is deliberately left null WITHOUT crediting
--     the customer's wallet, since NexaVerify would otherwise be eating that
--     cost itself. This flag is what stops the sweep's own
--     "retry pending refunds" recovery pass (which normally auto-credits any
--     'cancelled' + refunded_at IS NULL rental, assuming the gap was just a
--     transient adjust_balance failure) from wrongly auto-crediting these —
--     they need an admin to look at the account and decide manually.
--     DaisySMS's cancelRental has no equivalent "did they actually refund
--     us" field, so this never applies to that provider (its ACCESS_CANCEL
--     response is treated as full confirmation on its own).
-- ----------------------------------------------------------------------------
alter table public.rentals add column if not exists refunded_at timestamptz;
alter table public.rentals add column if not exists cancel_error text;
alter table public.rentals add column if not exists refund_denied_by_provider boolean not null default false;

-- Backfill: every rental already sitting at status='cancelled' before this
-- feature existed was refunded synchronously in the same request by the
-- pre-existing manual cancel route — mark them refunded now so the new
-- idempotency guard doesn't try to refund any of them again.
update public.rentals set refunded_at = updated_at where status = 'cancelled' and refunded_at is null;

create index if not exists rentals_user_id_idx on public.rentals(user_id);
create index if not exists rentals_long_term_idx on public.rentals(is_long_term);
create index if not exists rentals_daisy_id_idx on public.rentals(daisy_id);
create index if not exists rentals_daisysim_activation_id_idx on public.rentals(daisysim_activation_id);
create index if not exists rentals_daisysim_usa_activation_id_idx on public.rentals(daisysim_usa_activation_id);
create index if not exists rentals_waiting_created_at_idx on public.rentals(created_at) where status = 'waiting';

alter table public.rentals enable row level security;

drop policy if exists "rentals_select_own" on public.rentals;
create policy "rentals_select_own" on public.rentals
  for select using (auth.uid() = user_id);

-- ============================================================================
-- transactions: append-only ledger. Every balance change (purchase, refund,
-- admin top-up/adjustment) gets a row here. Never update balance directly —
-- always go through adjust_balance() so this ledger and profiles.balance
-- can never drift apart.
-- ============================================================================
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('deposit', 'purchase', 'refund', 'admin_adjustment', 'payout')),
  amount numeric(12,2) not null,       -- positive = credit, negative = debit
  balance_after numeric(12,2) not null,
  reference_id uuid,                   -- rentals.id when applicable
  note text,
  created_by uuid references public.profiles(id), -- admin id, for admin_adjustment rows
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_id_idx on public.transactions(user_id);

alter table public.transactions enable row level security;

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);

-- ============================================================================
-- sms_messages: raw log of every code/message the DaisySMS webhook sends us.
-- A rental can receive more than one message (see "Additional rentals" in
-- the API docs), so this is one-to-many against rentals.
-- ============================================================================
create table if not exists public.sms_messages (
  id bigserial primary key,
  rental_id uuid not null references public.rentals(id) on delete cascade,
  daisy_message_id bigint,
  code text,
  text text,
  received_at timestamptz not null default now()
);

create index if not exists sms_messages_rental_id_idx on public.sms_messages(rental_id);

alter table public.sms_messages enable row level security;

drop policy if exists "sms_messages_select_own" on public.sms_messages;
create policy "sms_messages_select_own" on public.sms_messages
  for select using (
    exists (
      select 1 from public.rentals r
      where r.id = sms_messages.rental_id
        and r.user_id = auth.uid()
    )
  );

-- ============================================================================
-- currency_rates: exchange rates used ONLY to display NGN prices/balances in
-- another currency on screen (and to convert DaisySMS's USD LTR renewal fees
-- into NGN — see lib/ltr-sync.js). NGN is always the real ledger currency —
-- nothing is ever actually charged in USD/GBP/EUR to a customer.
--
-- Two sources feed this, and `ngn_per_unit` always holds whichever one is
-- currently "in effect":
--   auto_ngn_per_unit  = last value pulled from the free live exchange-rate
--                        API (see lib/exchange-rate.js + the "Refresh live
--                        rates" button / pg_cron job). Read-only from the
--                        admin's point of view.
--   manual_override    = if true, an admin has hand-set a fixed rate for
--                        this currency and the live sync will keep updating
--                        auto_ngn_per_unit in the background WITHOUT
--                        touching ngn_per_unit — the admin's number wins
--                        until they switch back to "live".
-- Seed values below are just a starting placeholder for ngn_per_unit until
-- the first live sync runs (or an admin sets a manual rate) — see
-- /admin/currency.
-- ============================================================================
create table if not exists public.currency_rates (
  currency text primary key check (currency in ('USD', 'GBP', 'EUR')),
  ngn_per_unit numeric(12,4) not null,      -- the effective rate used everywhere
  auto_ngn_per_unit numeric(12,4),          -- last value fetched from the live API
  manual_override boolean not null default false, -- true = admin's number wins over live
  updated_at timestamptz not null default now()
);

-- Backfills the new columns without touching existing data if you already
-- ran an earlier version of this file.
alter table public.currency_rates add column if not exists auto_ngn_per_unit numeric(12,4);
alter table public.currency_rates add column if not exists manual_override boolean not null default false;

insert into public.currency_rates (currency, ngn_per_unit) values
  ('USD', 1500),
  ('GBP', 1900),
  ('EUR', 1650)
on conflict (currency) do nothing;

alter table public.currency_rates enable row level security;

drop policy if exists "currency_rates_select_all" on public.currency_rates;
create policy "currency_rates_select_all" on public.currency_rates
  for select using (true); -- everyone needs to read rates to show the currency switcher

-- ============================================================================
-- topup_requests: a customer asks to add funds; an admin approves or
-- rejects it. Approving calls adjust_balance() so it lands in the same
-- transactions ledger as everything else. This is deliberately a manual
-- review queue (not a payment processor) until real payment funding is
-- wired up — see BuyForm.js/topup page for the customer-facing side.
-- ============================================================================
create table if not exists public.topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_ngn numeric(12,2) not null check (amount_ngn > 0),
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists topup_requests_user_id_idx on public.topup_requests(user_id);
create index if not exists topup_requests_status_idx on public.topup_requests(status);

alter table public.topup_requests enable row level security;

drop policy if exists "topup_requests_select_own" on public.topup_requests;
create policy "topup_requests_select_own" on public.topup_requests
  for select using (auth.uid() = user_id);

-- No client insert/update policy on purpose — customers submit requests via
-- POST /api/wallet/topup-request and admins review via POST
-- /api/admin/topups/review, both using the service role key.

-- ============================================================================
-- payment_transactions: real wallet funding via PocketFi (see
-- lib/pocketfi.js) — this is the "real payment funding" the topup_requests
-- comment above refers to. Shared by TWO funding methods, distinguished by
-- `provider`:
--
--   'pocketfi' (hosted checkout, no longer the default /topup UI but the
--   code still works): one row per checkout session.
--     1. POST /api/wallet/fund creates this row with status='pending' right
--        after calling PocketFi's Initialize Payment, using the payment_id
--        it returns.
--     2. The customer is redirected to PocketFi's hosted checkout, then back
--        to our own /api/wallet/fund/callback?ref=... (we built that
--        redirect_link ourselves, so we already know which row it is).
--     3. The callback (or the manual "Check status" retry, or the webhook —
--        see app/api/pocketfi/webhook) calls PocketFi's Confirm Payment API
--        and, only if still 'pending', atomically flips this row to
--        'completed' and calls adjust_balance(). See lib/wallet-funding.js.
--
--   'pocketfi_virtual_account' (the current default — see
--   public.virtual_accounts below): one row per bank transfer into a
--   customer's dedicated account number, inserted directly as 'completed'
--   by app/api/pocketfi/webhook the moment the webhook fires — there's no
--   redirect step to confirm against for a bank transfer, so the webhook IS
--   the only crediting path here. payment_id holds PocketFi's
--   transaction.reference (or a synthetic id if a webhook omits it), and the
--   unique (provider, payment_id) index below is what stops a retried
--   webhook delivery from crediting the same transfer twice.
-- ============================================================================
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'pocketfi',
  payment_id text not null,
  -- A UUID WE generate before ever calling PocketFi, embedded in the
  -- redirect_link query string we submit with Initialize Payment (as
  -- ?ref=<client_ref>). PocketFi's payment_id doesn't exist yet at the
  -- moment redirect_link has to be decided (both are part of the same
  -- request), so this is what the callback route actually looks the row up
  -- by when PocketFi sends the browser back — not payment_id. Only used by
  -- the 'pocketfi' checkout provider — null for 'pocketfi_virtual_account'
  -- rows, which have no redirect step at all.
  client_ref text,
  amount_ngn numeric(12,2) not null check (amount_ngn > 0),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  confirmed_amount_ngn numeric(12,2),
  note text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Backfill for installs that ran an earlier version of this file where
-- client_ref was NOT NULL — safe to re-run even if already nullable.
alter table public.payment_transactions alter column client_ref drop not null;

create unique index if not exists payment_transactions_payment_id_idx
  on public.payment_transactions (provider, payment_id);
drop index if exists payment_transactions_client_ref_idx;
create unique index if not exists payment_transactions_client_ref_idx
  on public.payment_transactions (client_ref) where client_ref is not null;
create index if not exists payment_transactions_user_id_idx on public.payment_transactions(user_id);
create index if not exists payment_transactions_status_idx on public.payment_transactions(status);

alter table public.payment_transactions enable row level security;

drop policy if exists "payment_transactions_select_own" on public.payment_transactions;
create policy "payment_transactions_select_own" on public.payment_transactions
  for select using (auth.uid() = user_id);

-- No client insert/update policy on purpose — every write goes through
-- /api/wallet/fund, /api/wallet/fund/callback, /api/wallet/fund/verify, or
-- /api/pocketfi/webhook, all using the service role key.

-- ============================================================================
-- virtual_accounts: one permanent, dedicated bank account per customer,
-- issued by PocketFi (see lib/pocketfi.js createVirtualAccount) — this is
-- the current default funding method shown on /topup (VirtualAccountCard).
-- Created lazily, once, the first time a customer's page calls
-- POST /api/wallet/virtual-account and finds no row here yet for them.
-- Unlike the checkout flow, there's no interactive step to embed our own
-- reference into — the customer just transfers money to this account
-- whenever they like, and PocketFi's webhook is the ONLY signal we ever get
-- that money arrived (see the payment_transactions comment above and
-- lib/wallet-funding.js's creditVirtualAccountFromWebhook).
-- ============================================================================
create table if not exists public.virtual_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  provider text not null default 'pocketfi',
  bank text not null,
  account_number text not null,
  account_name text not null,
  created_at timestamptz not null default now()
);

alter table public.virtual_accounts enable row level security;

drop policy if exists "virtual_accounts_select_own" on public.virtual_accounts;
create policy "virtual_accounts_select_own" on public.virtual_accounts
  for select using (auth.uid() = user_id);

-- No client insert/update policy on purpose — only
-- POST /api/wallet/virtual-account (service role key) creates these.

-- ============================================================================
-- pocketfi_config: admin-controlled settings for PocketFi funding, so these
-- can change without a redeploy. Singleton table (id always true), same
-- pattern as daisysim_config — see app/admin/pocketfi.
--   virtual_account_enabled: on/off switch for the whole "permanent dedicated
--     account number" funding flow shown on /topup (VirtualAccountCard).
--     Turning this off does NOT delete/deactivate accounts already issued to
--     customers (see public.virtual_accounts) — it only stops /topup from
--     offering the flow and stops new accounts being created.
--   virtual_account_bank: which bank PocketFi issues NEW virtual accounts
--     against (see lib/pocketfi.js createVirtualAccount). Changing this only
--     affects customers who don't have an account yet — existing customers
--     keep the account number/bank they were already issued, since PocketFi
--     has no "move this account to a different bank" operation. kuda /
--     safehaven / paga / 9psb all work without collecting NIN/BVN; palmpay
--     requires both, which NexaVerify doesn't collect, so accounts may fail
--     to create for some customers if palmpay is selected.
-- ============================================================================
create table if not exists public.pocketfi_config (
  id boolean primary key default true check (id),
  virtual_account_enabled boolean not null default true,
  virtual_account_bank text not null default 'kuda'
    check (virtual_account_bank in ('kuda', 'safehaven', 'paga', '9psb', 'palmpay')),
  updated_at timestamptz not null default now()
);

insert into public.pocketfi_config (id) values (true) on conflict (id) do nothing;

alter table public.pocketfi_config enable row level security;

drop policy if exists "pocketfi_config_select_all" on public.pocketfi_config;
create policy "pocketfi_config_select_all" on public.pocketfi_config
  for select using (true);

-- No client insert/update policy on purpose — only
-- /api/admin/pocketfi/config (service role key) writes this.

-- ============================================================================
-- pocketfi_webhook_events: raw audit log of every webhook PocketFi sends us
-- (app/api/pocketfi/webhook). PocketFi's documented webhook payload
-- (order + transaction.reference) doesn't include the payment_id/account
-- number we'd need to reliably match every event to a specific customer —
-- see the big comments in lib/pocketfi.js and lib/wallet-funding.js — so for
-- checkout payments the webhook is NOT the primary crediting path (the
-- redirect callback is), but for virtual account transfers it's the ONLY
-- path, since there's no redirect step for a bank transfer. This table
-- exists so an admin can look at what PocketFi actually sent in production,
-- spot any transfer that came in but couldn't be auto-matched
-- (matched_user_id is null), and tighten the matching logic once the real
-- payload shape is confirmed. No RLS select policy on purpose — nobody
-- needs to see this from the browser, service role only.
-- ============================================================================
create table if not exists public.pocketfi_webhook_events (
  id bigserial primary key,
  payload jsonb,
  signature_valid boolean not null default false,
  matched_payment_id text,
  received_at timestamptz not null default now()
);

-- Backfill for installs that ran an earlier version of this file.
alter table public.pocketfi_webhook_events add column if not exists matched_user_id uuid;
-- Raw incoming request headers — added while diagnosing the first real
-- webhook coming back with signature_valid = false. PocketFi's docs don't
-- pin down the exact header name their signature travels under (their own
-- Node.js example even reads a non-standard 'http_pocketfi_signature'
-- header), so this captures everything sent until the real header name and
-- POCKETFI_SECRET_KEY match-up is confirmed from a live event.
alter table public.pocketfi_webhook_events add column if not exists headers jsonb;

alter table public.pocketfi_webhook_events enable row level security;

-- ============================================================================
-- Storage bucket for automated backups (see app/api/admin/backup/run/route.js).
-- Private (public=false) — only the service role can read/write it, same as
-- every table above. Nightly snapshots of profiles/transactions/rentals land
-- here as JSON files instead of relying on manual CSV exports.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

-- ============================================================================
-- adjust_balance(): the ONLY way balance should ever change. Locks the
-- profile row, applies the delta, refuses to go negative, and writes the
-- matching transactions row atomically. Called from server code with the
-- service role key (bypasses RLS by design — this function is the gate).
-- ============================================================================
create or replace function public.adjust_balance(
  p_user_id uuid,
  p_amount numeric,
  p_type text,
  p_reference_id uuid default null,
  p_note text default null,
  p_created_by uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance numeric(12,2);
begin
  perform 1 from public.profiles where id = p_user_id for update;

  update public.profiles
     set balance = balance + p_amount
   where id = p_user_id
  returning balance into v_new_balance;

  if v_new_balance < 0 then
    raise exception 'Insufficient balance: adjustment of % would result in %', p_amount, v_new_balance
      using errcode = 'P0001';
  end if;

  insert into public.transactions (user_id, type, amount, balance_after, reference_id, note, created_by)
  values (p_user_id, p_type, p_amount, v_new_balance, p_reference_id, p_note, p_created_by);

  return v_new_balance;
end;
$$;

-- Lock this function down so it can ONLY be called by server-side code using
-- the service role key (your admin routes, purchase/refund/LTR-renewal
-- logic) — never directly by a customer's browser session, even though the
-- function itself is SECURITY DEFINER. Postgres grants EXECUTE on new
-- functions to PUBLIC by default, which would otherwise let any logged-in
-- user call this RPC straight from the browser with supabase.rpc(...) and
-- adjust anyone's balance. This closes that off.
revoke execute on function public.adjust_balance(uuid, numeric, text, uuid, text, uuid) from public;
revoke execute on function public.adjust_balance(uuid, numeric, text, uuid, text, uuid) from anon;
revoke execute on function public.adjust_balance(uuid, numeric, text, uuid, text, uuid) from authenticated;
grant execute on function public.adjust_balance(uuid, numeric, text, uuid, text, uuid) to service_role;

-- ============================================================================
-- onboarding_config: content for the welcome popup (see
-- components/WelcomeModal.js, app/admin/onboarding). Singleton table (id
-- always true), same pattern as daisysim_config/pocketfi_config — lets an
-- admin edit the Telegram link, support link, and copy without a redeploy.
-- Shown on every dashboard visit while enabled=true, unless the customer has
-- muted it for 24h (see profiles.onboarding_muted_until above). Turning this
-- off here hides it for everyone regardless of anyone's mute state.
-- ============================================================================
create table if not exists public.onboarding_config (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  telegram_url text,
  support_url text,
  welcome_title text not null default 'Welcome to NexaVerify!',
  welcome_intro text not null default
    'You''re all set — here''s a quick rundown before you get started.',
  buy_instructions text not null default
    'Go to USA & Canada or All Countries in the menu, pick a service, and buy — your number and the SMS code both show up right on your Dashboard.',
  sms_costs_text text not null default
    'You''re only charged once a code actually arrives on your number. Every price is shown in Naira up front, before you buy.',
  updated_at timestamptz not null default now()
);

insert into public.onboarding_config (id) values (true) on conflict (id) do nothing;

alter table public.onboarding_config enable row level security;

drop policy if exists "onboarding_config_select_all" on public.onboarding_config;
create policy "onboarding_config_select_all" on public.onboarding_config
  for select using (true);

-- No client insert/update policy on purpose — only
-- /api/admin/onboarding/config (service role key) writes this.

-- ============================================================================
-- Digital Accounts — "Bulk Account Upload" feature. A completely separate
-- product line from the phone-number/SMS providers above: pre-made account
-- credentials (Discord logs, Twitter accounts, IG accounts, etc.), organized
-- into admin-created categories -> product templates, stocked by uploading a
-- CSV of individual accounts per template, and sold one CSV row per unit —
-- a customer buying quantity 3 gets exactly 3 distinct, never-before-sold
-- rows, and the template shows "out of stock" the instant available rows
-- hit 0. See lib/digitalAccountsCsv.js for the CSV parsing/validation and
-- app/api/digital-accounts/orders/route.js for the purchase flow.
--
-- digital_categories: just a name + optional description (e.g. "Discord").
-- Not archivable/hideable itself — deleting one cascades its templates (and
-- therefore their stock and, via template_id set null on digital_orders,
-- unlinks but does NOT delete past orders — see digital_orders below).
-- ============================================================================
create table if not exists public.digital_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

alter table public.digital_categories enable row level security;

drop policy if exists "digital_categories_select_all" on public.digital_categories;
create policy "digital_categories_select_all" on public.digital_categories
  for select using (true);

-- No client insert/update/delete policy on purpose — only
-- /api/admin/digital-accounts/categories/* (service role key) writes this.

-- ============================================================================
-- digital_product_templates: one row per sellable product (e.g. "4 YEARS OLD
-- DISCORD LOGS"), scoped to a category, with its own flat NGN price and
-- description — the price/description live here, NOT per stock unit, so
-- editing them never touches already-uploaded (or already-sold) stock rows.
--   favorite: pins it to the top, same semantics as every other catalog's
--     favorite flag in this schema.
--   archived: an admin's "take this off sale" switch, independent of stock
--     count — customers never see an archived template and can't buy it even
--     if it still has stock; unlike running out of stock (which is
--     temporary/self-healing on re-upload), archiving is a deliberate choice.
-- Selecting is public/select-all (like every catalog table here) since the
-- name/price/description aren't sensitive — the actual account credentials
-- live in digital_stock_items below, which is NOT publicly selectable.
-- ============================================================================
create table if not exists public.digital_product_templates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.digital_categories(id) on delete cascade,
  name text not null,
  price_ngn numeric(12,2) not null check (price_ngn >= 0),
  description text,
  favorite boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists digital_product_templates_category_idx on public.digital_product_templates(category_id);

alter table public.digital_product_templates enable row level security;

drop policy if exists "digital_product_templates_select_all" on public.digital_product_templates;
create policy "digital_product_templates_select_all" on public.digital_product_templates
  for select using (true);

-- No client insert/update/delete policy on purpose — only
-- /api/admin/digital-accounts/templates/* (service role key) writes this.

-- ============================================================================
-- digital_orders: one row per purchase (a customer buying quantity 3 of a
-- template is ONE order row, not three) — see
-- app/api/digital-accounts/orders/route.js and public.purchase_digital_product
-- below, which is the only thing that ever inserts here.
--   template_name / category_name: denormalized snapshots taken at purchase
--     time, same reasoning as social_boost_orders.service_name — so a past
--     order's Order Details page still shows the right product name even if
--     the admin later renames/deletes the template or category (template_id
--     goes null via ON DELETE SET NULL rather than deleting order history).
--   unit_price_ngn / total_ngn: what was actually charged, frozen at
--     purchase time — never recomputed if the template's price later changes.
-- RLS: select_own, same as rentals/telegram_gift_orders/social_boost_orders —
-- a customer can only ever see their own order rows (which is how the Order
-- Details page authorizes itself). No select policy at all on the actual
-- credentials (digital_stock_items) — the Order Details route additionally
-- re-checks ownership server-side with the service role key before ever
-- reading a credential row, rather than relying on RLS for that part.
-- ============================================================================
create table if not exists public.digital_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  template_id uuid references public.digital_product_templates(id) on delete set null,
  template_name text not null,
  category_name text,
  quantity integer not null check (quantity > 0),
  unit_price_ngn numeric(12,2) not null,
  total_ngn numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists digital_orders_user_id_idx on public.digital_orders(user_id);

alter table public.digital_orders enable row level security;

drop policy if exists "digital_orders_select_own" on public.digital_orders;
create policy "digital_orders_select_own" on public.digital_orders
  for select using (auth.uid() = user_id);

-- No client insert/update policy on purpose — only
-- public.purchase_digital_product() (called with the service role key from
-- app/api/digital-accounts/orders) ever writes this.

-- ============================================================================
-- digital_stock_items: the actual inventory — ONE row per account credential
-- set, uploaded via CSV to a specific template (see
-- app/api/admin/digital-accounts/templates/[id]/upload). This is the ONLY
-- place account credentials are stored, and it deliberately has NO select
-- policy at all (not even select_own) — every read of this table, by an
-- admin or by a customer viewing their own Order Details page, goes through
-- a Route Handler using the service role key that does its own explicit
-- authorization check, rather than relying on a row-level policy to get this
-- exactly right for such sensitive data.
--   status: 'available' until sold. A template's live stock count shown to
--     customers is just count(status='available') for that template_id —
--     hits 0 the instant the last row is claimed, which is also exactly when
--     a purchase for it should start being rejected/greyed out as "Out of
--     stock".
--   order_id / sold_at: set atomically by public.purchase_digital_product()
--     below the moment a row is claimed for a purchase — never set any other
--     way, so a row's sold state and the order that consumed it can never
--     drift apart.
--   Only `password` is NOT NULL — every other credential field is optional,
--     matching the CSV upload's own required/optional column split (password
--     required; email OR username required — enforced at upload time in
--     lib/digitalAccountsCsv.js, not by a DB constraint, since "at least one
--     of two columns" isn't expressible as a simple NOT NULL).
-- ============================================================================
create table if not exists public.digital_stock_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.digital_product_templates(id) on delete cascade,
  username text,
  email text,
  password text not null,
  email_password text,
  two_fa text,
  recovery_email text,
  recovery_email_password text,
  status text not null default 'available' check (status in ('available', 'sold')),
  order_id uuid references public.digital_orders(id) on delete set null,
  sold_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists digital_stock_items_template_status_idx
  on public.digital_stock_items(template_id, status);
create index if not exists digital_stock_items_order_id_idx on public.digital_stock_items(order_id);

alter table public.digital_stock_items enable row level security;

-- No select/insert/update/delete policy at all, deliberately — see the big
-- comment above. Every access goes through a Route Handler with the service
-- role key that authorizes itself explicitly.

-- ============================================================================
-- purchase_digital_product(): the ONLY way a digital account purchase ever
-- happens. Does everything in one atomic transaction so nothing can ever
-- half-happen:
--   1. Locks the template row, rejects if missing/archived.
--   2. Locks + claims exactly p_quantity 'available' stock rows for that
--      template (FOR UPDATE SKIP LOCKED — so two concurrent purchases of the
--      same template can never claim the same row twice). If fewer than
--      p_quantity rows are actually available, raises and rolls back
--      EVERYTHING below (no order row, no debit, no rows marked sold) — this
--      is the out-of-stock/oversell guard.
--   3. Inserts the digital_orders row (with denormalized name snapshots).
--   4. Marks the claimed stock rows sold, tied to that order.
--   5. Debits the buyer's wallet via adjust_balance() — which itself raises
--      (rolling back everything above too) if the balance would go negative,
--      so an unaffordable purchase never claims stock or creates an order
--      either.
-- Locked down to service_role only, same as adjust_balance() itself — see
-- app/api/digital-accounts/orders/route.js for the one caller.
-- ============================================================================
create or replace function public.purchase_digital_product(
  p_user_id uuid,
  p_template_id uuid,
  p_quantity integer
)
returns public.digital_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template record;
  v_total numeric(12,2);
  v_order public.digital_orders;
  v_ids uuid[];
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be at least 1' using errcode = 'P0001';
  end if;

  select * into v_template
    from public.digital_product_templates
   where id = p_template_id
   for update;

  if not found or v_template.archived then
    raise exception 'This product is no longer available' using errcode = 'P0001';
  end if;

  v_total := round(v_template.price_ngn * p_quantity, 2);

  select array_agg(id) into v_ids
    from (
      select id from public.digital_stock_items
       where template_id = p_template_id and status = 'available'
       order by created_at
       limit p_quantity
       for update skip locked
    ) s;

  if v_ids is null or array_length(v_ids, 1) is distinct from p_quantity then
    raise exception 'Only % of the % requested unit(s) are in stock', coalesce(array_length(v_ids, 1), 0), p_quantity
      using errcode = 'P0001';
  end if;

  insert into public.digital_orders (user_id, template_id, template_name, category_name, quantity, unit_price_ngn, total_ngn)
  select p_user_id, v_template.id, v_template.name, c.name, p_quantity, v_template.price_ngn, v_total
    from public.digital_categories c
   where c.id = v_template.category_id
  returning * into v_order;

  update public.digital_stock_items
     set status = 'sold', order_id = v_order.id, sold_at = now()
   where id = any(v_ids);

  perform public.adjust_balance(
    p_user_id,
    -v_total,
    'purchase',
    v_order.id,
    format('Digital account: %sx %s', p_quantity, v_template.name),
    null
  );

  return v_order;
end;
$$;

revoke execute on function public.purchase_digital_product(uuid, uuid, integer) from public;
revoke execute on function public.purchase_digital_product(uuid, uuid, integer) from anon;
revoke execute on function public.purchase_digital_product(uuid, uuid, integer) from authenticated;
grant execute on function public.purchase_digital_product(uuid, uuid, integer) to service_role;

-- ============================================================================
-- One-time: promote yourself to admin after your first signup.
-- Replace the email before running.
-- ============================================================================
-- update public.profiles set role = 'admin' where email = 'you@example.com';
