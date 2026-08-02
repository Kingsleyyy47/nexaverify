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

create index if not exists rentals_user_id_idx on public.rentals(user_id);
create index if not exists rentals_long_term_idx on public.rentals(is_long_term);
create index if not exists rentals_daisy_id_idx on public.rentals(daisy_id);
create index if not exists rentals_daisysim_activation_id_idx on public.rentals(daisysim_activation_id);

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
-- One-time: promote yourself to admin after your first signup.
-- Replace the email before running.
-- ============================================================================
-- update public.profiles set role = 'admin' where email = 'you@example.com';
