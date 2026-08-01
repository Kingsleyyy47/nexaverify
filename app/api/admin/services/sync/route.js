import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPricesVerification } from "@/lib/daisy";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Pulls the live service list + prices from DaisySMS (service => country =>
// { cost, count }) and upserts it into public.services. New services default
// to enabled=false (see schema) so nothing goes on sale before you review it.
//
// Callable two ways: by a logged-in admin (button click in /admin/services),
// or by a scheduled job carrying CRON_SECRET (see lib/cron-auth.js and
// supabase/cron.sql) — that's what lets this run automatically on a timer.
//
// NOTE: the DaisySMS docs don't give human-readable service names, only
// shortcodes (e.g. "wa", "go") — this stores the shortcode as the name too.
// Rename services later directly in Supabase if you want nicer labels.
export async function POST(request) {
  if (!isAuthorizedCron(request)) {
    const { user, profile } = await getSessionProfile();
    if (!user || !isAdmin(profile)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let data;
  try {
    data = await getPricesVerification();
  } catch (err) {
    return NextResponse.json({ error: "Could not reach DaisySMS" }, { status: 502 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Build the full list of rows to sync from DaisySMS's response first,
  // entirely in memory — no DB calls yet.
  //
  // Confirmed via live testing: this account's getPricesVerification
  // response is FLAT — service => {cost, count, multi} — with no
  // country-level nesting at all (e.g. {"7eleven":{"cost":0.12,"count":272,
  // "multi":1}, ...}). The docs' "service => country => data" shape doesn't
  // apply here (DaisySMS is USA-only for this account, so there's nothing
  // to nest by country). The original code assumed the nested shape, drilled
  // into a non-existent country key, landed on a bare number instead of an
  // object, and every service silently synced with cost=0/count=null.
  // Handle both shapes defensively in case a nested response ever shows up.
  const rows = [];
  for (const [serviceId, entryOrCountries] of Object.entries(data || {})) {
    if (!entryOrCountries || typeof entryOrCountries !== "object") continue;

    const entry =
      "cost" in entryOrCountries || "price" in entryOrCountries
        ? entryOrCountries // flat shape — this is the entry itself
        : entryOrCountries["187"] || entryOrCountries["0"] || Object.values(entryOrCountries)[0];

    if (!entry || typeof entry !== "object") continue;

    const cost = Number(entry.cost ?? entry.price ?? 0);
    if (!Number.isFinite(cost)) continue; // guard against a bad value silently becoming null in the DB

    rows.push({
      id: serviceId,
      cost,
      count: entry.count ?? entry.quantity ?? null,
    });
  }

  // One query to find out which of these already exist (and their current
  // name/auto-markup settings), instead of one query PER service — this is
  // what made syncing dozens/hundreds of DaisySMS services slow enough to
  // time out (each service previously cost up to 2 sequential round trips:
  // a lookup, then an insert or update).
  const { data: existingRows } = await admin
    .from("services")
    .select("id, name, auto_markup, markup_amount");
  const existingById = new Map((existingRows || []).map((r) => [r.id, r]));

  // Only fetched if at least one existing service actually has auto_markup
  // on — no need to hit currency_rates otherwise.
  const needsUsdRate = (existingRows || []).some((r) => r.auto_markup && r.markup_amount != null);
  let usdRate = null;
  if (needsUsdRate) {
    const { data: usdRateRow } = await admin
      .from("currency_rates")
      .select("ngn_per_unit")
      .eq("currency", "USD")
      .maybeSingle();
    usdRate = usdRateRow ? Number(usdRateRow.ngn_per_unit) : null;
  }

  const toInsert = rows
    .filter((r) => !existingById.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.id,
      enabled: false,
      last_price: r.cost,
      last_count: r.count,
      last_synced_at: now,
    }));

  const toUpdate = rows
    .filter((r) => existingById.has(r.id))
    .map((r) => {
      const existing = existingById.get(r.id);
      const update = {
        id: r.id,
        // `name` is NOT NULL with no default in the schema. Postgres's
        // ON CONFLICT DO UPDATE still validates NOT NULL constraints on the
        // candidate INSERT row for columns not listed here — even though
        // this will always resolve as an UPDATE (toUpdate is pre-filtered to
        // ids that already exist) — so name has to be carried through
        // unchanged, otherwise upsert() fails before it ever reaches the
        // update. Deliberately does NOT touch `enabled` — sync can never
        // silently turn a product on or off.
        name: existing.name,
        last_price: r.cost,
        last_count: r.count,
        last_synced_at: now,
      };

      // Auto-markup: only for services an admin has explicitly opted in.
      // Recomputes customer_price from the FRESH cost + the saved margin,
      // every sync — manual (auto_markup=false) services are left exactly
      // as they were, same as before this feature existed.
      if (existing.auto_markup && existing.markup_amount != null && usdRate) {
        const costNgn = r.cost * usdRate;
        update.customer_price = Math.max(0, Math.round((costNgn + Number(existing.markup_amount)) * 100) / 100);
      }

      return update;
    });

  // Bulk insert brand-new services (one call for all of them).
  if (toInsert.length > 0) {
    const { error } = await admin.from("services").insert(toInsert);
    if (error) {
      return NextResponse.json({ error: `Could not insert new services: ${error.message}` }, { status: 500 });
    }
  }

  // Bulk-refresh price/count for services that already exist. Never touches
  // `enabled` — sync can't silently turn a product on or off. `customer_price`
  // is only ever included for services with auto_markup on (see above); for
  // every other (manual) service it's omitted entirely, so it's never
  // touched by sync, exactly like before this feature existed.
  if (toUpdate.length > 0) {
    const { error } = await admin
      .from("services")
      .upsert(toUpdate, { onConflict: "id" });
    if (error) {
      return NextResponse.json({ error: `Could not update existing services: ${error.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ synced: toInsert.length + toUpdate.length });
}
