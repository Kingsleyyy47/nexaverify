# Supabase setup for NexaVerify

Everything you (the owner) need to do in Supabase to make the site work. Do these in order.

## 1. Create the project

1. Go to supabase.com → New project.
2. Pick a name (e.g. `nexaverify`), a strong database password (save it somewhere), and a region close to your users.
3. Wait for it to finish provisioning (~2 minutes).

## 2. Run the database schema

1. In your Supabase project, open **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this project, paste the whole file in, and click **Run**.
3. This creates: `profiles`, `services`, `rentals`, `transactions`, `sms_messages`, `currency_rates`, `topup_requests`, the `adjust_balance()` function, and a trigger that auto-creates a profile row whenever someone signs up.

You can re-run this file safely later if you need to — it won't duplicate anything.

**A note on login:** customers sign up with a username + email + password, but sign in with just
their **username** + password — Supabase Auth itself only understands email under the hood, so
`app/api/auth/login/route.js` looks up the email tied to that username (server-side, via the
service role key) and signs in with it behind the scenes. This means Supabase's own
Authentication tab will still show each user by email — that's expected, the username lives on
`profiles.username`, not in `auth.users`.

**A note on currency:** NexaVerify bills entirely in Naira (NGN). `services.customer_price` (what you set on `/admin/products`) is what customers actually pay; `services.last_price` (from DaisySMS sync) is only your cost reference. `currency_rates` holds USD/GBP/EUR-to-NGN rates (seeded with placeholders — see `/admin/currency`) used purely to *display* converted prices/balances, and to convert DaisySMS's USD long-term rental fees into NGN when charging for renewals. Each currency can be set to **Live** (auto-refreshed from a free, keyless exchange-rate API — nothing to sign up for) or **Custom** (you type a fixed number by hand) — see section 6.

## 3. Turn on email auth

1. **Authentication → Providers → Email** — make sure it's enabled.
2. **Authentication → URL Configuration** — set:
   - Site URL: your real domain once you have one (e.g. `https://nexaverify.com`), or `http://localhost:3000` while developing.
   - Redirect URLs: add both your local and production URLs.
3. If you don't want a public "Sign up" flow at all (invite-only), turn off "Allow new users to sign up" under **Authentication → Providers → Email**, and create accounts manually from the Supabase dashboard instead.

**"Email rate limit exceeded" during signup:** Supabase's built-in email sender (the one that works with zero setup) is explicitly a testing-only shared service with a very low limit — a small handful of emails per hour, shared across everyone using it. It's not meant to survive repeated signup/testing attempts, let alone real customers. Fix it properly before real users show up:

1. Go to **Authentication → Sign In / Providers → SMTP Settings** (Supabase has moved this between a couple of menu locations across versions — search "SMTP" in the dashboard if you don't see it under Auth settings directly).
2. Enable **Custom SMTP** and fill in credentials from a real provider — Resend, Postmark, SendGrid, Mailgun, or even Gmail SMTP with an app password all work. This removes Supabase's shared rate limit entirely; your own provider's limits (usually much higher, or pay-as-you-go) apply instead.
3. Save, then send a fresh test signup to confirm mail actually arrives from your own domain/address.

Until you set that up, you're on the shared limit — if you hit "rate limit exceeded" while testing, wait roughly an hour for it to reset rather than repeatedly retrying signups, since each attempt (even failed ones that still trigger an email send) counts against the shared quota.

## 4. Get your API keys

Go to **Project Settings → API**. You'll need three values for the app's `.env.local` (copy `.env.example` to `.env.local` and fill these in):

- `NEXT_PUBLIC_SUPABASE_URL` — the "Project URL"
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the "anon public" key
- `SUPABASE_SERVICE_ROLE_KEY` — the "service_role" key. **Never** put this in anything that ships to the browser — it bypasses all security rules. It's only read on the server (Route Handlers).

You'll also need three values that come from DaisySMS/your own choice, not Supabase — all go in the
same `.env.local`:

- `DAISYSMS_API_KEY` — from your DaisySMS dashboard.
- `DAISYSMS_WEBHOOK_SECRET` — any random string you make up yourself (e.g. `openssl rand -hex 16`). Used in section 7.
- `CRON_SECRET` — any random string you make up yourself. Used in section 9.

That's the complete list of secrets/keys the whole app needs. Nothing else requires a key —
notably, the live currency-rate feature (section 6) calls a free public API that needs no signup
and no key at all, so there's nothing there that can expire or get rate-limited on you.

## 5. Make yourself an admin

1. Sign up for a NexaVerify account through the site itself (this creates your `profiles` row automatically via the trigger).
2. Back in Supabase → **SQL Editor**, run:
   ```sql
   update public.profiles set role = 'admin' where email = 'your@email.com';
   ```
3. Log out and back in on the site. You should now see the `/admin` pages.

Every other account that signs up defaults to `role = 'customer'` and can never see `/admin` — that's enforced both by the app's route protection and by the fact that admin actions go through server routes using the service role key.

## 6. Set currency rates, then price and turn on products

Two things need to happen before a product is actually purchasable, and order matters:

1. Go to `/admin/currency`. For each of USD/GBP/EUR you can pick:
   - **Live** — click **Refresh live rates** (top of the page) to pull a real rate from a free,
     keyless exchange-rate API. It'll keep itself updated automatically once section 9's cron job
     is set up (every 6 hours), or you can click the button any time to refresh it manually.
   - **Custom** — type in a fixed NGN rate yourself. It stays exactly what you typed, even while
     live refreshes keep happening in the background for reference — flip back to **Live** any
     time to let it take over again.
   Until the first live refresh runs (or you set a custom rate), the placeholder values seeded by
   `schema.sql` are what's in effect — set this before you have long-term customers relying on
   auto-renew, since it's also the rate used to convert DaisySMS's USD renewal fees into NGN.
2. Go to `/admin/products` and click **Sync from DaisySMS** — this pulls the live service list +
   DaisySMS's own USD cost from `getPricesVerification` into the `services` table. Every synced
   product starts **disabled** with no customer price, so nothing is accidentally sellable before
   you've reviewed it.
3. For each product you want to sell: type in a **customer price in Naira** (this is what actually
   gets charged at checkout — it has no automatic relationship to DaisySMS's USD cost shown next to
   it, so this is where your margin comes from) and toggle it **enabled**. A product only shows up
   on the customer-facing Products page once both are set.
4. You can flip any product off instantly (e.g. DaisySMS runs out of stock, or their price rises
   enough to eat your margin) without touching code — the next purchase attempt will simply be
   blocked.

Wallet funding is a manual review queue for now (no payment processor wired up yet): customers
submit a request from `/topup`, and you approve or reject it from `/admin/topups`. Approving calls
`adjust_balance()` just like everything else, so it lands in the same transactions ledger.

## 7. Set the DaisySMS webhook

1. In your DaisySMS dashboard → profile page, set the webhook URL to:
   ```
   https://YOUR-DOMAIN.com/api/daisy/webhook?secret=YOUR_DAISYSMS_WEBHOOK_SECRET
   ```
   using the same value you put in `DAISYSMS_WEBHOOK_SECRET` in your `.env.local`. This stops random internet traffic from posting fake "code received" events into your database.
2. This lets incoming SMS codes get pushed to NexaVerify instantly instead of only showing up when a customer's browser happens to poll for status.

## 8. Long-term rentals (LTR) and auto-renew billing — PAUSED

**Status as of 2026-07-31: automatic renewal billing is paused.** This section originally
described syncing against DaisySMS's `GET /api/ltrs` to detect renewals and auto-charge wallets.
Live testing against the real deployed site proved that endpoint doesn't work the way DaisySMS's
own marketing docs (hosted on `.com`) describe: on `daisysms.io` — the domain this account's API
key actually belongs to — `/api/ltrs` redirects to the DaisySMS login page instead of returning
JSON, because it's a web-dashboard route, not a public API endpoint. `.io`'s own published API
docs (`daisysms.io/docs/api`) confirm this: they document only `getBalance`, `getNumber`,
`getStatus`, `setStatus`, `getExtraActivation`, `getPrices(Verification)`, and webhooks — there is
no bulk list, expiry-check, `keep`, or `setAutoRenew` action documented at all for this account.

Because of this, there is currently no real DaisySMS endpoint to sync long-term rentals against,
so:

- The `nexaverify-sync-ltrs` cron job is commented out in `supabase/cron.sql` — if you already ran
  the old version of that file, run `select cron.unschedule('nexaverify-sync-ltrs');` once in
  Supabase's SQL Editor to remove it.
- `POST /api/admin/rentals/sync-ltrs` now just returns a `{ paused: true }` response instead of
  attempting (and failing) a sync — safe to leave any old scheduler pointed at it.
- The "Sync LTRs from DaisySMS" button on `/admin/numbers` has been replaced with a plain notice.
- Customers can still buy long-term-duration numbers (this uses `getNumber` with `duration=`,
  which is real and documented) — but nothing currently auto-detects renewals or auto-charges a
  wallet for them. Track and renew these manually via `/admin/numbers` for now.
- The customer-facing "auto-renew" toggle and "keep" button call DaisySMS actions
  (`setAutoRenew`, `keep`) that aren't in `.io`'s documented API either — treat these as unverified
  until tested against a real long-term rental; they may also fail.

`lib/ltr-sync.js` still contains the original reconciliation logic, kept for reference in case
DaisySMS later confirms a working endpoint for this account (or you switch to a `.com`-based
account, which does appear to support `/api/ltrs` per the docs, just rejecting this key). Don't
re-enable the cron job or re-wire the sync route until that's confirmed with a real test.

## 9. Automatic scheduling (pg_cron + pg_net) — no external cron needed

Three things run on a repeating timer: syncing DaisySMS's service list/prices, refreshing live
currency rates (section 6), and backing up your data (section 10). All three run entirely inside
Supabase, on a schedule, without you clicking anything or paying for a separate cron host. (A
fourth job, long-term rental sync/billing, is currently commented out — see section 8, paused.)

**Set it up (one time, after you've deployed the site somewhere with a real domain):**

1. Open `supabase/cron.sql` from this project.
2. Replace `YOUR-DOMAIN.com` with your actual deployed domain, and `YOUR_CRON_SECRET` with the
   value you set for `CRON_SECRET` in your hosting provider's environment variables (same variable
   as in `.env.example`).
3. Paste the whole file into Supabase's **SQL Editor** and run it. This enables the `pg_cron` and
   `pg_net` extensions and schedules three active jobs:
   - Service list + prices sync — every hour
   - Live currency rate refresh — every 6 hours (only touches currencies set to "Live")
   - Data backup — once a day

That's it — from then on, all three keep running on their own. You can check on them any time:

```sql
select * from cron.job;                                               -- see what's scheduled
select * from cron.job_run_details order by start_time desc limit 20; -- see recent runs/failures
```

Why this needs a real domain: these jobs work by having Supabase's servers call your website's own
admin routes over the internet (the same way a browser would click the "Sync" button) — they can't
reach a site running on your laptop at `localhost`. Run them against `http://localhost:3000` and
they'll just fail quietly with a connection error, which is harmless but also does nothing. Set
this up once you've deployed.

If you'd rather not use pg_cron at all, any external scheduler works too — e.g. Vercel Cron hitting
`POST /api/admin/services/sync`, `POST /api/admin/currency-rates/sync`, and
`POST /api/admin/backup/run` with an `x-cron-secret` header set to your `CRON_SECRET`. The routes
don't care which scheduler calls them.

## 10. Backups

`POST /api/admin/backup/run` snapshots your `profiles`, `transactions`, and `rentals` tables to a
timestamped JSON file in a private Supabase Storage bucket called `backups` (created automatically
by `schema.sql`), and automatically deletes anything beyond the most recent 30 snapshots. Once
section 9's cron job is set up, this happens once a day on its own — nobody needs to remember to
export a CSV.

You can also trigger it manually any time by calling that same route while logged in as admin, and
you can browse/download the files from **Storage → backups** in the Supabase dashboard.

This is on top of, not instead of, Supabase's own automatic daily backups (available on paid
plans) — those protect your whole database including things this snapshot doesn't cover; this
snapshot specifically protects the money/inventory data even on the free plan.

## 11. PocketFi wallet funding

Customers fund their wallet by transferring to a permanent, dedicated bank account PocketFi issues
per customer — shown on `/topup` (`VirtualAccountCard`). This replaced the manual, admin-reviewed
top-up request entirely, and also replaced an earlier hosted-checkout-redirect version of this
feature; that checkout code (`app/api/wallet/fund/*`, `PocketfiFundForm`) is still in the codebase
and still works, it's just not linked from the UI anymore.

1. Re-run `schema.sql` (see section 2) — it added `public.payment_transactions`,
   `public.pocketfi_webhook_events` (a raw audit log), and `public.virtual_accounts` (the
   one-per-customer bank account mapping).
2. Sign up at [pocketfi.ng](https://pocketfi.ng), complete business verification, then go to
   **Settings → API Keys** to get your credentials.
3. **Important — the dashboard shows two keys, named backwards from what you'd expect:** use the
   one labeled **Public API Key** (marked LIVE, an `id|token` credential) as `POCKETFI_PUBLIC_KEY`
   below — that's the actual server-to-server Bearer token this app calls PocketFi with, despite
   the "public" name. The **Secret API Key** (marked CONFIDENTIAL, a plain hex string) is NOT a
   valid bearer token at all — it's only used to verify the HMAC-SHA512 signature on inbound
   webhooks (still needed, just for a different purpose — see step 5). This integration had these
   two swapped for a while (Secret key used as the Bearer token), which is what caused
   intermittent "Unauthenticated." rejections — if you see that error, this is the first thing to
   check.
4. Add to your `.env.local` (and your Vercel project's env vars):
   ```
   POCKETFI_PUBLIC_KEY=your-pocketfi-public-key
   POCKETFI_SECRET_KEY=your-pocketfi-secret-key
   POCKETFI_BUSINESS_ID=your-pocketfi-business-id
   POCKETFI_BASE_URL=https://api.pocketfi.ng/api/v1
   ```
   Use `https://api.pocketfi.ng/api/test` for `POCKETFI_BASE_URL` while testing in sandbox — no
   real card or bank details needed there.
5. In PocketFi's Dashboard → **Settings → Webhooks**, set the webhook URL to:
   ```
   https://YOUR-DOMAIN.com/api/pocketfi/webhook
   ```
6. **How crediting actually works, and its real limitation:** virtual account transfers have no
   redirect step to confirm against the way checkout does — the webhook is the *only* signal
   NexaVerify ever gets that a transfer landed. PocketFi's documented webhook payload
   (`order` + `transaction.reference`) doesn't show which account received the transfer, so
   `app/api/pocketfi/webhook` checks several plausible field names for an account number
   (see the comment there) and matches it against `public.virtual_accounts`. Until a real
   production webhook is inspected, some transfers may come in as `signature_valid = true` but
   `matched_user_id = null` in `pocketfi_webhook_events` — check that table periodically at first,
   and manually credit via `adjust_balance()` in SQL Editor for anything unmatched, then tighten
   the field-matching once you've seen a real payload.
7. Test it: on `/topup`, a customer's account number is created automatically on first visit
   (`POST /api/wallet/virtual-account`). Send a small sandbox transfer to it, then check
   `pocketfi_webhook_events` for the event and `payment_transactions` for a `pocketfi_virtual_account`
   row with `status = 'completed'`.
8. **Switching bank / turning the flow off:** go to `/admin/pocketfi` — pick which bank issues new
   accounts (kuda, safehaven, paga, 9psb, or palmpay) and flip the whole flow on/off. Both are
   stored in `public.pocketfi_config`, not an env var, so they take effect immediately with no
   redeploy. Two things worth knowing: switching banks only changes which bank *new* customers get
   — PocketFi has no way to move an already-issued account to a different bank, so existing
   customers keep what they have; and turning the flow off doesn't deactivate accounts already
   issued, it just stops `/topup` from offering new ones.

## 12. DaisySim — second numbers provider ("International Numbers")

DaisySim is a second, optional numbers provider added alongside DaisySMS, not a replacement —
DaisySMS keeps working exactly as before. DaisySim is country+service scoped (you pick a country,
then a service, then a live price tier) rather than DaisySMS's flat service list, so it's shown to
customers as its own product at `/products/international`, never under the DaisySMS brand name.
Customer-facing UI never says "DaisySim" — only the admin panel does.

1. Re-run `schema.sql` (see section 2) — it added `provider`, `daisysim_activation_id`,
   `country_name`, `service_code`, `service_name` columns to `public.rentals`, and a new
   `public.daisysim_config` singleton table (one row, `enabled` + `markup_amount_ngn`).
2. Sign up at [daisysim.com](https://daisysim.com) and get your API key from their dashboard.
3. Add to your `.env.local` (and your Vercel project's env vars):
   ```
   DAISYSIM_API_KEY=your-daisysim-api-key
   DAISYSIM_BASE_URL=https://daisysim.com/api/v1/virtual
   DAISYSIM_WEBHOOK_SECRET=pick-a-random-string
   ```
4. In DaisySim's dashboard, set the webhook URL to:
   ```
   https://YOUR-DOMAIN.com/api/daisysim/webhook?secret=THE_SAME_RANDOM_STRING
   ```
   DaisySim's docs don't describe a request-signing scheme, so this shared-secret query param is
   the only thing stopping random internet traffic from posting fake "code received" events —
   same convention already used for the DaisySMS webhook.
5. Go to `/admin/international` and turn it on, with whatever ₦ markup you want added on top of
   the USD→NGN converted price DaisySim returns (uses the same `currency_rates` USD rate as
   DaisySMS's long-term rentals). It's off by default — customers see a "not available" card on
   `/products/international` until you flip this.
6. Test it: buy a number on `/products/international`, confirm a `rentals` row appears with
   `provider = 'daisysim'`, and that cancelling/receiving a code behaves the same as a normal
   DaisySMS number from the customer's point of view.
7. **Favorites and blocks per country+service:** re-run `schema.sql` again if you haven't since
   this was added — it created `public.daisysim_overrides`. On `/admin/international`, the
   "Catalog — favorites & blocks" section lets you pick a country, browse its live service list,
   and toggle a star (pins that service to the top of that country's list for customers) or
   Enabled/Disabled (hides it from customers and blocks purchase entirely) per combo. There's no
   per-service pricing here — DaisySim's prices are live/expiring tiers, not something you can set
   like DaisySMS's Products page — only favorite and disabled.

## 13. Forgot password / reset password

Customers who forget their password use `/forgot-password` (linked from the sign-in form) — they
enter their username or email, `/api/auth/forgot-password` looks up the account the same way
login does and calls Supabase's `resetPasswordForEmail`, which emails a link to `/reset-password`
where they set a new one. Admins can also bypass all of this and set a password directly for a
user from `/admin/users/[id]` (no email involved) for support cases.

1. In Supabase Dashboard → **Authentication → URL Configuration**, add your reset-password page
   to **Redirect URLs** — e.g. `https://www.nexaverify.org/reset-password` (and
   `http://localhost:3000/reset-password` if you test locally). Supabase silently ignores
   `redirectTo` if it isn't on this allowlist, which looks like the email never arrives when it
   actually just redirected nowhere useful.
2. Under **Authentication → Email Templates → Reset Password**, this uses Supabase's default
   template as-is — no changes needed unless you want to customize the wording/branding of the
   email itself.
3. Test it: go to `/forgot-password`, enter a real test account's username or email, and follow
   the emailed link — it should land on `/reset-password` and let you set a new password, then
   sign you straight in.

## 14. Welcome popup (onboarding)

Shown to every customer on every `/dashboard` visit — Telegram/support links, "how to buy" and
"SMS costs" blurbs, a "Get Started" button. All content is admin-editable at `/admin/onboarding`,
backed by `public.onboarding_config` — no code changes needed to update the links or wording.

1. Re-run `schema.sql` if you haven't since this was added — it added
   `profiles.onboarding_muted_until` and the `public.onboarding_config` singleton table (defaults
   are pre-filled, so the popup works out of the box even before you touch the admin page).
2. Go to `/admin/onboarding` and set your real Telegram channel link and support link — both are
   optional; leaving either blank just hides that button. Edit the title/copy fields too if you
   want different wording than the defaults.
3. Two different closes, on purpose (Kingsley's rule):
   - The X or "Get Started" only dismiss it for that page load — nothing is saved, so it's back on
     the customer's next dashboard visit.
   - The separate "Don't show for 24 hours" button is the only thing that persists anything: it
     sets `profiles.onboarding_muted_until` to now + 24h via `/api/onboarding/mute`, and the popup
     stays hidden for that customer until that timestamp passes.
   - Turning the popup off entirely at `/admin/onboarding` (the enabled toggle) hides it for
     everyone regardless of anyone's mute state.
   - There's no "reset for everyone" button since there's nothing permanent to reset; to force it
     to show for all customers right now regardless of an active 24h mute, it's a single SQL
     statement: `update public.profiles set onboarding_muted_until = null;`.
   - `profiles.onboarding_seen_at` is a leftover column from the old one-time-dismissal behavior —
     no longer read anywhere, safe to ignore.

## 15. 3-minute no-code timeout (auto-cancel + refund)

Any short-term rental (DaisySMS or DaisySim, not long-term ones) that sits 3 minutes with no code
gets cancelled on the provider, cancelled in NexaVerify, and fully refunded to the customer's
wallet — automatically, even if they've closed the tab. This runs server-side on a timer, not in
the browser.

1. Re-run `schema.sql` — it added `rentals.refunded_at` (the idempotency guard so a manual cancel
   and the timeout sweep can never both refund the same rental) and `rentals.cancel_error` (last
   provider-cancel failure, for your visibility only — check it in Table Editor if a customer
   reports a stuck rental). It also backfills `refunded_at` for every rental already cancelled
   before this existed, so nothing gets double-refunded on first run.
2. Run `cron.sql` again (or just the new `nexaverify-sweep-timeouts` job at the bottom if you've
   already run the rest) — same `YOUR-DOMAIN.com` / `YOUR_CRON_SECRET` placeholders as the other
   jobs. It calls `/api/admin/rentals/sweep-timeouts` every minute.
3. **What it actually does, and the ordering that makes it safe:**
   - Finds every `status = 'waiting'`, non-long-term rental older than 3 minutes.
   - Calls the provider's cancel endpoint FIRST, before touching anything locally.
   - If a code arrived at the exact moment of cancelling (both providers can reject a cancel this
     way), the rental is marked `received` with the code instead — no cancellation, no refund. This
     is rare but real, so don't be surprised if an occasional "timed out" rental actually got a code.
   - Only after a successful provider cancel (or the provider saying there was nothing left to
     cancel) does it touch the rental row — and it claims the cancellation and the refund together
     in one atomic update (`WHERE status = 'waiting' AND refunded_at IS NULL`). If a customer
     manually cancels that exact rental in the same instant, whichever request's update actually
     matches a row is the only one that refunds; the other sees nothing to do.
   - If the provider call itself fails (network hiccup, timeout) the rental is left exactly as
     `waiting` — no special retry bookkeeping needed, it's simply still past the cutoff on the next
     run, a minute later, and gets tried again automatically. The error is logged to
     `rentals.cancel_error` so you can see it without digging through function logs.
   - In the much rarer case the provider cancel succeeds but crediting the wallet fails, the sweep
     retries just the refund on the next run (it won't try to cancel on the provider a second time).
4. Test it: buy a short-term number, don't request/receive a code, and either wait 3-4 minutes or
   trigger the route manually (`curl -X POST https://YOUR-DOMAIN.com/api/admin/rentals/sweep-timeouts -H "x-cron-secret: YOUR_CRON_SECRET"`) once you've backdated a test rental's `created_at` in Table
   Editor. Confirm the rental flips to `cancelled`, `transactions` gets a `refund` row, and the
   wallet balance goes back up by the full price.

## 16. Provider on/off toggles (APIs & Providers)

One master switch per provider, controlled from `/admin/providers`. Off means gone: the section
disappears from the customer-facing site (nav link, product list, dashboard widget) AND the
purchase endpoint refuses new orders server-side, so a stale bookmark or direct API call can't get
through while it's off. On means everything comes back instantly — no redeploy.

1. What's new:
   - `public.daisysms_config` — a new singleton settings table (same pattern as `daisysim_config`
     and `pocketfi_config`), with a single `enabled` column. This is the missing piece — DaisySim
     and PocketFi already had their own config tables from earlier features; DaisySMS didn't.
   - `/admin/providers` — a new admin page with three toggles: USA & Canada (DaisySMS), All
     countries (DaisySim), and Wallet top-up (PocketFi virtual accounts). Each toggle writes to the
     same config table/column its own detailed settings page (`/admin/products`, `/admin/international`,
     `/admin/pocketfi`) already reads from — this is just a faster single place to flip them, not a
     second source of truth.
   - Server-side gates in `/api/rentals/buy` (DaisySMS) check `daisysms_config.enabled` before
     renting; the DaisySim buy route already had this pattern from the international-catalog feature
     and now reads the same toggle. A disabled provider returns a clean `403` with `"This service
     isn't available right now"` rather than a stack trace.
   - `/products` and the dashboard's quick-buy list check the toggle too, and show a plain "not
     available" card instead of the product list when off.
   - The sidebar (`CustomerSidebar.js`) drops the "USA and Canada" or "All countries" link entirely
     when its provider is off — not greyed out, just not there.
2. What to run: re-run `supabase/schema.sql` in the SQL Editor (idempotent — safe to run in full
   even though most of it already exists). This creates the one new table, `daisysms_config`, seeded
   with `enabled = true` so nothing changes for you until you actually flip it.
3. Defaults if you skip the re-run or on any row that's somehow missing: DaisySMS fails **open**
   (`enabled ?? true`) since it's your original, already-live provider — an un-migrated install
   keeps working exactly as before. DaisySim fails **closed** (`enabled ?? false`), matching its
   existing opt-in default from the international-catalog feature. PocketFi virtual accounts fail
   **open** (`?? true`), matching its existing default.
4. Test it: go to `/admin/providers`, flip "All countries" off, save, then check `/products/international`
   as a customer (or logged out) — should show "not available" and the sidebar link should be gone.
   Flip it back on and confirm it returns immediately, no redeploy.

## 17. "US Only" — a third phone-number provider

A brand new, fully separate provider alongside DaisySMS (USA & Canada) and DaisySim "All
countries". It uses a different API/product line on DaisySim's side (their "server7" base path,
`https://daisysim.com/api/v1/server7`) — USA-only, flat catalog where `GET /apps/USA` already
returns every service with its live, final price attached (no country picker, no price tiers, and
no webhook — codes only arrive by polling `GET /check/{id}`, same as how NexaVerify already polls
DaisySMS).

1. What's new:
   - `lib/daisysimUsa.js` — new provider wrapper, reads `DAISYSIM_USA_API_KEY` /
     `DAISYSIM_USA_BASE_URL`.
   - `public.daisysim_usa_config` (singleton, `enabled` off by default, `markup_amount_ngn`) and
     `public.daisysim_usa_overrides` (per-service favorite/disabled, no country dimension since
     it's USA-only) — same shape as the equivalent DaisySim "All countries" tables.
   - `rentals.provider` now also accepts `'daisysim_usa'`, with its own
     `rentals.daisysim_usa_activation_id` column (kept separate from `daisysim_activation_id` since
     they're different APIs with their own ID namespaces).
   - Customer: `/products/us-only` (a flat tap-to-buy list, no country/tier drill-down), a matching
     dashboard quick-buy section (shown above the USA & Canada section, per your ordering), and a
     "US Only" sidebar link — positioned above "USA and Canada".
   - Admin: `/admin/us-only` (enable + markup + favorites/blocks), and a fourth toggle on
     `/admin/providers` ("US Only (DaisySim USA)").
   - The same billing-safety pattern as "All countries": the customer is billed off DaisySim's real
     `amount_charged` returned at purchase time, not the price they last saw on screen.
   - The existing 3-minute no-code timeout sweep (`/api/admin/rentals/sweep-timeouts`) now handles
     this provider too — no separate cron job needed, it's the same route, same schedule.
2. What to run:
   - Re-run `supabase/schema.sql` (idempotent, safe in full) — creates the two new tables, widens
     the `rentals.provider` check constraint, and adds the new activation-id column.
   - Add to `.env.local` and your Vercel project's env vars — same key as `DAISYSIM_API_KEY`
     (Kingsley confirmed it's the same account/key, just a different base URL for this product
     line):
     ```
     DAISYSIM_USA_API_KEY=DA_TJwMBMIudbkH0HXzIRKFJEppkwhq03XzP5ES7e2j
     DAISYSIM_USA_BASE_URL=https://daisysim.com/api/v1/server7
     ```
   - No separate webhook to register. The server7 docs only document polling, but since
     `DAISYSIM_API_KEY` and `DAISYSIM_USA_API_KEY` are the same account, the ONE webhook already
     configured for "All countries" (Settings -> Webhook URL in DaisySim's dashboard, pointed at
     `/api/daisysim/webhook`) is account-wide and may push "US Only" codes through it too.
     `app/api/daisysim/webhook/route.js` now checks both providers' activation-id columns, so this
     is handled automatically either way — polling is still the primary path for this provider,
     the webhook is just a free bonus if DaisySim happens to send it.
3. Test it: go to `/admin/us-only`, turn it on, set a markup, save. Check `/products/us-only` as a
   customer — a flat priced list should show. Buy a test number and confirm the sidebar/dashboard
   sections both reflect it, and that `/admin/providers` toggling "US Only" off hides all of it
   immediately.

## 18. Telegram Premium & Stars — a FOURTH provider (iStar), opt-in customer visibility

A completely different kind of provider from the three phone-number ones above: this doesn't rent
numbers, it spends TON or USDT from **your own iStar developer wallet** to gift Telegram Stars or
Telegram Premium subscriptions to a username. Order processing is asynchronous (place the order,
then a webhook or a manual poll tells you it completed or failed later).

1. What's new:
   - `lib/istar.js` — new provider wrapper, reads `ISTAR_API_KEY` / `ISTAR_BASE_URL`. Auth is a
     plain `API-Key` header, **not** `Authorization: Bearer` like every other provider in this
     project — a likely copy-paste mistake if you ever touch this file.
   - `public.istar_config` (singleton — `enabled`, `customer_visible`, `ngn_per_star`,
     `markup_amount_ngn`) and `public.telegram_gift_orders` (one row per star/premium order, with
     the same `refunded_at` idempotency-guard pattern used on `rentals` for atomic, retry-safe
     refunds).
   - Admin: `/admin/telegram-premium` (two separate toggles — see point 2 below — plus
     price-per-star + premium markup + live iStar wallet balance), and a fifth toggle on
     `/admin/providers` ("Telegram Premium & Stars (iStar)") that maps to `enabled` only.
   - Customer: `/products/telegram-premium` and a "Telegram Premium" sidebar link (with a small
     "Soon" badge while `customer_visible` is off).
   - `app/api/telegram/webhook/route.js` — verifies iStar's `X-iStar-Signature` header
     (HMAC-**SHA256** over the raw body, signed with `ISTAR_WEBHOOK_SECRET`) and updates orders on
     `order.completed` / `order.failed`, refunding the buyer's NGN wallet on failure.
   - `app/api/telegram/orders/[id]/status/route.js` — manual poll fallback, scoped to the order's
     own owner (admin or customer, whoever placed it), for when the webhook hasn't arrived, e.g.
     local dev with no public URL registered.
   - `app/api/telegram/star/buy` and `app/api/telegram/premium/buy` — debits the calling user's own
     wallet, whether that's you testing as admin or a real customer.
2. **Two separate, deliberately independent switches on `istar_config` — not one:**
   - `enabled`: gates whether *you* (admin) can place a real, wallet-charging test order on
     `/products/telegram-premium`. Always available to you regardless of `customer_visible`.
   - `customer_visible`: off by default. While off, every non-admin visitor sees "Telegram Premium"
     marked **Coming soon** no matter what `enabled` says. Once you flip it on, real customers get
     the same buy flow you tested — billed from their own NGN wallet — but with a simplified view: no
     TON/USDT wallet picker (that's an internal detail, not a customer choice — always sent as
     `"TON"` for them) and no raw provider order IDs shown, matching the white-labeling rule below.
     The intended workflow is: turn `enabled` on, test it yourself, then turn `customer_visible` on
     when you're satisfied.
3. Also deliberately different: since iStar has no documented order-cancellation endpoint, both buy
   routes create the iStar order **before** touching the local wallet, and do not attempt a rollback
   if the local DB insert or wallet debit fails afterward — the iStar-side spend is already real and
   irreversible at that point, so the route instead logs clearly and surfaces the iStar `order_id`
   for manual reconciliation. This is unlike the phone-number providers, which all have a real
   cancel endpoint to fall back on.
4. What to run:
   - Re-run `supabase/schema.sql` (idempotent, safe in full) — creates `istar_config` and
     `telegram_gift_orders`.
   - Add to `.env.local` and your Vercel project's env vars:
     ```
     ISTAR_API_KEY=your-istar-api-key
     ISTAR_BASE_URL=https://v1.fragmentapi.com/api/v1/partner
     ISTAR_WEBHOOK_SECRET=change-me
     ```
   - Paste this exact URL into the iStar dashboard's Webhooks settings, using the same
     `ISTAR_WEBHOOK_SECRET` value you set above:
     ```
     https://www.nexaverify.org/api/telegram/webhook
     ```
     A missing/misconfigured secret makes the webhook route reject every request (by design — no
     "skip verification" fallback, unlike the query-string-secret convention used by DaisySMS/
     DaisySim).
5. Test it: go to `/admin/telegram-premium`, turn "Enabled" on, set a price-per-star and a premium
   markup, save (the wallet balance card up top should show your iStar TON balance — if it errors,
   check `ISTAR_API_KEY`). As an admin, open `/products/telegram-premium`, search a recipient, and
   place a small test order; use the Refresh button if it stays "pending" for a while (webhook not
   yet registered, or still in flight). Log out / view as a non-admin to confirm the page shows only
   "Coming soon". Only once you're happy, go back and flip "Let customers see it" on — then check
   again as a non-admin to confirm the real (simplified) buy flow now shows instead.

## What NOT to do

- Don't add an `update` policy on `profiles` for the `authenticated` role, and don't hand-edit `balance` from the Table Editor in production — always go through `adjust_balance()` (either via the admin UI or by calling it from SQL Editor) so the `transactions` ledger stays accurate. Editing the column directly from the Table Editor works, but it silently breaks the audit trail.
- Don't expose `SUPABASE_SERVICE_ROLE_KEY`, `DAISYSMS_API_KEY`, `DAISYSIM_API_KEY`, `DAISYSIM_USA_API_KEY`, `ISTAR_API_KEY`, `ISTAR_WEBHOOK_SECRET`, `POCKETFI_PUBLIC_KEY`, or `POCKETFI_SECRET_KEY` in any client-side code, screenshots, or support tickets — despite the name, `POCKETFI_PUBLIC_KEY` is the live Bearer token and just as sensitive as a secret key.
- Don't refer to "DaisySim" or "iStar" anywhere in customer-facing UI — only the admin pages may name them; customers only ever see "International Numbers"/"All countries" and "Telegram Premium".
- Don't confuse `istar_config.enabled` with `istar_config.customer_visible` — the first is your own admin test-ordering access, the second (separate, off by default) is what actually opens the buy flow to real customers. See section 18.
- Don't show the TON/USDT wallet picker or a raw `istar_order_id` to a non-admin on `/products/telegram-premium` — `TelegramGiftBuyForm`'s `isAdminView` prop controls this; it's not a customer-facing decision or something they should see.
