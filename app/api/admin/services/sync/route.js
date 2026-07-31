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
  let synced = 0;

  for (const [serviceId, countries] of Object.entries(data || {})) {
    if (!countries || typeof countries !== "object") continue;

    // Prefer USA (187) if present, otherwise take the first country entry.
    const entry = countries["187"] || countries["0"] || Object.values(countries)[0];
    if (!entry) continue;

    const cost = Number(entry.cost ?? entry.price ?? 0);
    const count = entry.count ?? entry.quantity ?? null;

    const { data: existing } = await admin
      .from("services")
      .select("id")
      .eq("id", serviceId)
      .maybeSingle();

    if (existing) {
      await admin
        .from("services")
        .update({ last_price: cost, last_count: count, last_synced_at: now })
        .eq("id", serviceId);
    } else {
      await admin.from("services").insert({
        id: serviceId,
        name: serviceId,
        enabled: false,
        last_price: cost,
        last_count: count,
        last_synced_at: now,
      });
    }
    synced += 1;
  }

  return NextResponse.json({ synced });
}
