# NexaVerify

Rent phone numbers for SMS verification, powered by the DaisySMS API, with wallet billing in
Naira and a full admin panel. Built with Next.js (App Router) + Supabase.

Supabase-side setup (running the SQL, promoting an admin, currency rates, DaisySMS webhook,
scheduled jobs) is all covered in **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** — do that first.

## Running locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill in the values described in `SUPABASE_SETUP.md`
section 4 (already done if `.env.local` exists in this project). The site runs at
`http://localhost:3000`.

## Deploying (Vercel)

1. Push this repo to GitHub (see below if you're not sure how).
2. Go to [vercel.com](https://vercel.com) → **Add New... → Project** → import your GitHub repo.
   Vercel auto-detects Next.js — no build config needed.
3. Before the first deploy, add every variable from `.env.example` under **Settings →
   Environment Variables**, with real values (not the placeholders):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
     — from your Supabase project (Project Settings → API).
   - `DAISYSMS_API_KEY` — from your DaisySMS dashboard. **Must be a real key, not the
     placeholder** — nothing that rents a number will work until this is real.
   - `DAISYSMS_WEBHOOK_SECRET` and `CRON_SECRET` — any random strings you make up yourself
     (not the `change-me` placeholders).
4. Deploy. Vercel gives you a working URL like `nexaverify-xyz.vercel.app` — test the whole
   site there first.
5. Once you're happy and have bought your real domain: add it under **Settings → Domains** in
   Vercel (follow their DNS instructions from wherever you bought it). The `.vercel.app` URL
   keeps working the entire time, so nothing goes down while you switch — the domain is purely
   additive.

### When your real domain goes live

Nothing in the code is hardcoded to a domain, so buying `nexaverify.org` doesn't require any code
changes or a redeploy. Four things live outside the codebase need the real domain instead of the
`.vercel.app` one:

1. **Supabase → Authentication → URL Configuration** — set Site URL to `https://nexaverify.org`
   and add it to Redirect URLs.
2. **`supabase/cron.sql`** — replace `YOUR-DOMAIN.com` with `nexaverify.org` and re-run it in the
   SQL Editor (this just re-registers the same 4 scheduled jobs against the new URL).
3. **DaisySMS dashboard → webhook URL** — update it to
   `https://nexaverify.org/api/daisy/webhook?secret=YOUR_DAISYSMS_WEBHOOK_SECRET`.
4. **Vercel → Domains** — add the domain (step 5 above), and optionally make it primary once
   DNS has propagated.

## Pushing to GitHub

If you already have a GitHub repo created and just need to push this project into it:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

`.gitignore` already excludes `node_modules`, `.next`, and `.env.local` — your real Supabase/
DaisySMS keys never get committed.
