import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const CURRENCIES = ["USD", "GBP", "EUR"];

// The admin currency rate setter. Body shape: { USD: { mode, value }, GBP: {...}, EUR: {...} }
// mode is either "custom" (admin hand-sets a fixed NGN rate — manual_override
// becomes true) or "live" (switch back to whatever the live exchange-rate
// sync last fetched — manual_override becomes false). Used for display
// conversion everywhere, and to convert DaisySMS's USD long-term rental fees
// into NGN (see lib/ltr-sync.js).
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const admin = createAdminClient();

  // Validate everything up front so we never partially apply a bad request.
  for (const currency of CURRENCIES) {
    const entry = body[currency];
    if (!entry || (entry.mode !== "custom" && entry.mode !== "live")) {
      return NextResponse.json({ error: `Invalid request for ${currency}` }, { status: 400 });
    }
    if (entry.mode === "custom") {
      const value = Number(entry.value);
      if (!Number.isFinite(value) || value <= 0) {
        return NextResponse.json({ error: `Invalid rate for ${currency}` }, { status: 400 });
      }
    }
  }

  for (const currency of CURRENCIES) {
    const entry = body[currency];
    const now = new Date().toISOString();

    if (entry.mode === "custom") {
      await admin
        .from("currency_rates")
        .upsert(
          {
            currency,
            ngn_per_unit: Number(entry.value),
            manual_override: true,
            updated_at: now,
          },
          { onConflict: "currency" }
        );
    } else {
      // Switch back to live. Requires a live value to already exist —
      // otherwise there's nothing to fall back to yet.
      const { data: row } = await admin
        .from("currency_rates")
        .select("auto_ngn_per_unit")
        .eq("currency", currency)
        .maybeSingle();

      if (!row?.auto_ngn_per_unit) {
        return NextResponse.json(
          { error: `No live rate has been fetched yet for ${currency} — click "Refresh live rates" first.` },
          { status: 400 }
        );
      }

      await admin
        .from("currency_rates")
        .update({
          ngn_per_unit: row.auto_ngn_per_unit,
          manual_override: false,
          updated_at: now,
        })
        .eq("currency", currency);
    }
  }

  return NextResponse.json({ ok: true });
}
