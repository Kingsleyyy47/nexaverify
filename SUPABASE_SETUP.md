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
3. **Important — the dashboard shows two keys, and only one is right for this:** use the one
   labeled **Secret API Key** (marked CONFIDENTIAL, hidden by default) as `POCKETFI_SECRET_KEY`
   below — NOT the **Public API Key** (marked LIVE, shown in plaintext). The public key is for
   client-side use; the secret key is the server-to-server Bearer token this app actually calls
   PocketFi with. Using the public key by mistake is what caused every request to fail with
   "Unauthenticated." the first time this was set up.
4. Add to your `.env.local` (and your Vercel project's env vars):
   ```
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

## What NOT to do

- Don't add an `update` policy on `profiles` for the `authenticated` role, and don't hand-edit `balance` from the Table Editor in production — always go through `adjust_balance()` (either via the admin UI or by calling it from SQL Editor) so the `transactions` ledger stays accurate. Editing the column directly from the Table Editor works, but it silently breaks the audit trail.
- Don't expose `SUPABASE_SERVICE_ROLE_KEY`, `DAISYSMS_API_KEY`, `DAISYSIM_API_KEY`, or `POCKETFI_SECRET_KEY` in any client-side code, screenshots, or support tickets.
- Don't refer to "DaisySim" anywhere in customer-facing UI — only `/products/international` and admin pages may name it.
