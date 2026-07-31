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
    const { data: row } = await admin
      .from("currency_rates")
      .select("manual_override")
      .eq("currency", currency)
      .maybeSingle();

    const autoValue = Number(live[currency].toFixed(4));

    if (row?.manual_override) {
      // Keep the admin's manual number in effect — only refresh the
      // reference "live" value shown alongside it.
      await admin
        .from("currency_rates")
        .update({ auto_ngn_per_unit: autoValue })
        .eq("currency", currency);
      overridden += 1;
    } else {
      await admin
        .from("currency_rates")
        .upsert(
          {
            currency,
            auto_ngn_per_unit: autoValue,
            ngn_per_unit: autoValue,
            manual_override: false,
            updated_at: now,
          },
          { onConflict: "currency" }
        );
      updated += 1;
    }
  }

  return NextResponse.json({ updated, overridden, fetchedAt: live.fetchedAt });
}
