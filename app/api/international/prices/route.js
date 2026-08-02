import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { getPrices, computeNgnPrice, DaisySimError } from "@/lib/daisysim";
import { createAdminClient } from "@/lib/supabase/admin";

// Fetches DaisySim's live price tiers for a country+service and converts
// each to NGN for display (live USD tier price x admin-set usdRate, plus
// the flat NGN markup from public.daisysim_config) — the customer never
// sees a USD amount. The raw USD `price` is still returned per tier
// alongside `priceNgn` because /purchase requires that exact, unmodified
// USD value — see components/InternationalBuyForm.js and
// app/api/international/buy/route.js.
export async function POST(request) {
  const { user } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { countryId, serviceCode } = await request.json();
  if (!countryId || !serviceCode) {
    return NextResponse.json({ error: "countryId and serviceCode are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: config } = await admin
    .from("daisysim_config")
    .select("enabled, markup_amount_ngn")
    .eq("id", true)
    .maybeSingle();
  if (!config?.enabled) {
    return NextResponse.json({ error: "International numbers aren't available right now" }, { status: 403 });
  }

  const { data: usdRateRow } = await admin
    .from("currency_rates")
    .select("ngn_per_unit")
    .eq("currency", "USD")
    .maybeSingle();
  const usdRate = usdRateRow ? Number(usdRateRow.ngn_per_unit) : null;
  if (!usdRate) {
    return NextResponse.json(
      { error: "Pricing isn't set up yet — an admin needs to set a USD rate first." },
      { status: 503 }
    );
  }

  try {
    const result = await getPrices({ country: countryId, service: serviceCode });
    const tiers = (result.tiers || []).map((t) => ({
      tier: t.tier,
      price: t.price, // raw USD — pass through unmodified to /buy
      priceNgn: computeNgnPrice(t.price, usdRate, config.markup_amount_ngn),
      available: t.available,
    }));
    return NextResponse.json({ totalNumbers: result.total_numbers, tiers });
  } catch (err) {
    if (err instanceof DaisySimError) {
      const messages = {
        RATE_LIMITED: "Too many requests — wait a moment and try again.",
      };
      return NextResponse.json({ error: messages[err.code] || err.message }, { status: 502 });
    }
    throw err;
  }
}
