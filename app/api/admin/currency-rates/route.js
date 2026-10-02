import { readObjectBody } from "@/lib/request-body.mjs";
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

  const body = await readObjectBody(request);
  if (!body) return NextResponse.json({ error: "Send a valid JSON object." }, { status: 400 });
  const admin = createAdminClient();

  // Validate everything up front so we never partially apply a bad request.
  for (const currency of CURRENCIES) {
    const entry = body[currency];
    if (!entry || (entry.mode !== "custom" && entry.mode !== "live")) {
      return NextResponse.json({ error: `Invalid request for ${currency}` }, { status: 400 });
    }
    if (entry.mode === "custom") {
      const value = Number(entry.value);
      if (!Number.isFinite(value) || value < 0.0001 || value > 99_999_999.9999) {
        return NextResponse.json({ error: `Invalid rate for ${currency}` }, { status: 400 });
      }
    }
  }

  // Resolve every requested live rate before applying any changes.
  const { data: rates, error: readError } = await admin.from("currency_rates").select("currency, auto_ngn_per_unit");
  if (readError) return NextResponse.json({ error: "Could not load exchange rates." }, { status: 503 });
  const liveRates = Object.fromEntries((rates || []).map((r) => [r.currency, Number(r.auto_ngn_per_unit)]));
  for (const currency of CURRENCIES) {
    if (body[currency].mode === "live" && (!Number.isFinite(liveRates[currency]) || liveRates[currency] <= 0)) {
      return NextResponse.json({ error: `Refresh live rates before switching ${currency} to live.` }, { status: 400 });
    }
  }
  const updates = CURRENCIES.map((currency) => ({
    currency,
    ngn_per_unit: body[currency].mode === "custom" ? Number(body[currency].value) : liveRates[currency],
    manual_override: body[currency].mode === "custom",
    updated_at: new Date().toISOString(),
  }));
  const { error } = await admin.from("currency_rates").upsert(updates, { onConflict: "currency" });
  if (error) return NextResponse.json({ error: "Could not save exchange rates." }, { status: 503 });

  return NextResponse.json({ ok: true });
}
