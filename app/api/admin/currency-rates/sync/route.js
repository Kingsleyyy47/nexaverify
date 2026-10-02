import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchLiveNgnRates } from "@/lib/exchange-rate";
import { isAuthorizedCron } from "@/lib/cron-auth";

const CURRENCIES = ["USD", "GBP", "EUR"];

// Pulls live USD/GBP/EUR -> NGN rates from a free, keyless exchange-rate API
// and updates `auto_ngn_per_unit` for each currency. If a currency has
// manual_override = false, this ALSO updates the effective `ngn_per_unit` so
// the live number takes effect immediately. Currencies an admin has manually
// overridden are left with their custom `ngn_per_unit` untouched — only
// their `auto_ngn_per_unit` (the "here's what live shows" reference number)
// keeps refreshing in the background.
//
// Callable two ways, same pattern as the other sync routes: a logged-in
// admin clicking "Refresh live rates" in /admin/currency, or a scheduled job
// carrying CRON_SECRET (see lib/cron-auth.js and supabase/cron.sql).
export async function POST(request) {
  if (!isAuthorizedCron(request)) {
    const { user, profile } = await getSessionProfile();
    if (!user || !isAdmin(profile)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let live;
  try {
    live = await fetchLiveNgnRates();
  } catch (err) {
    return NextResponse.json(
      { error: "Could not reach the exchange rate service — try again shortly." },
      { status: 502 }
    );
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  let updated = 0;
  let overridden = 0;

  for (const currency of CURRENCIES) {
    const autoValue = Math.round(Number(live[currency]) * 10_000) / 10_000;
    if (!Number.isFinite(autoValue) || autoValue <= 0 || autoValue > 99_999_999.9999) {
      return NextResponse.json({ error: "The exchange service returned an invalid rate." }, { status: 502 });
    }
    // Insert missing currencies without replacing any existing admin settings.
    const { error: insertError } = await admin.from("currency_rates").upsert({
      currency, auto_ngn_per_unit: autoValue, ngn_per_unit: autoValue,
      manual_override: false, updated_at: now,
    }, { onConflict: "currency", ignoreDuplicates: true });
    if (insertError) return NextResponse.json({ error: "Could not save exchange rates." }, { status: 503 });

    const { error: referenceError } = await admin.from("currency_rates")
      .update({ auto_ngn_per_unit: autoValue }).eq("currency", currency);
    if (referenceError) return NextResponse.json({ error: "Could not save live reference rates." }, { status: 503 });

    // Check the override in the UPDATE itself, rather than using a stale read.
    const { data: applied, error: effectiveError } = await admin.from("currency_rates")
      .update({ ngn_per_unit: autoValue, updated_at: now })
      .eq("currency", currency).eq("manual_override", false).select("currency");
    if (effectiveError) return NextResponse.json({ error: "Could not update exchange rates." }, { status: 503 });
    if (applied?.length) updated += 1;
    else overridden += 1;
  }

  return NextResponse.json({ updated, overridden, fetchedAt: live.fetchedAt });
}
