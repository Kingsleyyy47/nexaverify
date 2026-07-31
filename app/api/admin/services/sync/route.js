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
  const rows = [];
  for (const [serviceId, countries] of Object.entries(data || {})) {
    if (!countries || typeof countries !== "object") continue;

    // Prefer USA (187) if present, otherwise take the first country entry.
    const entry = countries["187"] || countries["0"] || Object.values(countries)[0];
    if (!entry) continue;

    rows.push({
      id: serviceId,
      cost: Number(entry.cost ?? entry.price ?? 0),
      count: entry.count ?? entry.quantity ?? null,
    });
  }

  // One query to find out which of these already exist, instead of one
  // query PER service — this is what made syncing dozens/hundreds of
  // DaisySMS services slow enough to time out (each service previously cost
  // up to 2 sequential round trips: a lookup, then an insert or update).
  const { data: existingRows } = await admin.from("services").select("id");
  const existingIds = new Set((existingRows || []).map((r) => r.id));

  const toInsert = rows
    .filter((r) => !existingIds.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.id,
      enabled: false,
      last_price: r.cost,
      last_count: r.count,
      last_synced_at: now,
    }));

  const toUpdate = rows
    .filter((r) => existingIds.has(r.id))
    .map((r) => ({
      id: r.id,
      last_price: r.cost,
      last_count: r.count,
      last_synced_at: now,
    }));

  // Bulk insert brand-new services (one call for all of them).
  if (toInsert.length > 0) {
    const { error } = await admin.from("services").insert(toInsert);
    if (error) return NextResponse.json({ error: "Could not insert new services" }, { status: 500 });
  }

  // Bulk-refresh price/count for services that already exist. Deliberately
  // only sends last_price/last_count/last_synced_at — never `enabled` or
  // `name` — so this can never silently disable or reprice a service an
  // admin already turned on. Safe to use upsert() here specifically because
  // toUpdate is pre-filtered to ids we already confirmed exist, so it always
  // resolves as an update, never an insert.
  if (toUpdate.length > 0) {
    const { error } = await admin
      .from("services")
      .upsert(toUpdate, { onConflict: "id" });
    if (error) return NextResponse.json({ error: "Could not update existing services" }, { status: 500 });
  }

  return NextResponse.json({ synced: toInsert.length + toUpdate.length });
}
