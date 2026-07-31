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

## 8. Long-term rentals (LTR) and auto-renew billing

Customers can buy a number for a duration (1 day / 7 days / 1 month) instead of the standard
5-15 minute rental, and can turn auto-renew on so DaisySMS keeps the number alive automatically.

**How billing stays automatic (no manual balance edits, ever):**

Every time `/admin/rentals/sync-ltrs` runs, `lib/ltr-sync.js` compares each rental's stored
`paid_until` against DaisySMS's current `paid_until` from `GET /api/ltrs`. If it moved forward,
that means a renewal happened — NexaVerify immediately charges the customer's wallet
`daily_price × elapsed periods` via `adjust_balance()`, the same atomic function every other charge
uses. Nobody ever hand-edits a balance to make the books match — and the database itself won't
let any client call `adjust_balance()` directly (see the `revoke`/`grant` statements right after
it in `schema.sql`); only your own server-side code, running with the service role key, can.

If a customer's wallet can't cover a renewal charge, NexaVerify automatically calls DaisySMS's
`setAutoRenew` to turn auto-renew back OFF for that number (both on DaisySMS and in our own
`rentals` row) so it simply expires at the end of its current paid period instead of generating
repeated failed charges. The customer sees auto-renew flip back off next time they load the page.

This runs on a timer automatically — see section 9 below — you don't need to click anything for
it to keep happening.

**Before you turn this on for real customers:** the `daily_price` field from `GET /api/ltrs` is
assumed to be in dollars, matching every other price field in the DaisySMS API. Confirm this with
a small real long-term rental (buy one, enable auto-renew, watch what actually gets charged)
before relying on it at volume — the customer-facing auto-renew confirmation dialog's wording
should match whatever you find.

## 9. Automatic scheduling (pg_cron + pg_net) — no external cron needed

Four things need to happen on a repeating timer: syncing DaisySMS's service list/prices, syncing
long-term rentals (which is what makes section 8's billing automatic), refreshing live currency
rates (section 6), and backing up your data (section 10). All four now run entirely inside
Supabase, on a schedule, without you clicking anything or paying for a separate cron host.

**Set it up (one time, after you've deployed the site somewhere with a real domain):**

1. Open `supabase/cron.sql` from this project.
2. Replace `YOUR-DOMAIN.com` with your actual deployed domain, and `YOUR_CRON_SECRET` with the
   value you set for `CRON_SECRET` in your hosting provider's environment variables (same variable
   as in `.env.example`).
3. Paste the whole file into Supabase's **SQL Editor** and run it. This enables the `pg_cron` and
   `pg_net` extensions and schedules four jobs:
   - Service list + prices sync — every hour
   - Long-term rental sync + renewal billing — every 3 hours
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
`POST /api/admin/services/sync`, `POST /api/admin/rentals/sync-ltrs`,
`POST /api/admin/currency-rates/sync`, and `POST /api/admin/backup/run` with an `x-cron-secret`
header set to your `CRON_SECRET`. The routes don't care which scheduler calls them.

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

## What NOT to do

- Don't add an `update` policy on `profiles` for the `authenticated` role, and don't hand-edit `balance` from the Table Editor in production — always go through `adjust_balance()` (either via the admin UI or by calling it from SQL Editor) so the `transactions` ledger stays accurate. Editing the column directly from the Table Editor works, but it silently breaks the audit trail.
- Don't expose `SUPABASE_SERVICE_ROLE_KEY` or `DAISYSMS_API_KEY` in any client-side code, screenshots, or support tickets.
