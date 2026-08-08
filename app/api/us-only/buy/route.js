import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { purchaseNumber, computeNgnPrice, cancelActivation, DaisySimUsaError } from "@/lib/daisysimUsa";

// Buys a number via the "US Only" provider (third provider alongside
// DaisySMS and "All countries" DaisySim — see lib/daisysimUsa.js). Same
// pricing-safety pattern as app/api/international/buy/route.js: DaisySim
// resolves price server-side from the service code alone and ignores any
// price sent to it, so `priceUsd` from the client (whatever
// lib/usOnlyCatalog.js last showed them) is used ONLY as a pre-check
// estimate. The real, authoritative USD amount is `amount_charged` in the
// purchase response, and that — not the estimate — is what the customer is
// actually billed in NGN.
export async function POST(request) {
  const { user } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { serviceCode, serviceName, priceUsd } = await request.json();
  if (!serviceCode || priceUsd == null) {
    return NextResponse.json({ error: "serviceCode and priceUsd are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: config } = await admin
    .from("daisysim_usa_config")
    .select("enabled, markup_amount_ngn")
    .eq("id", true)
    .maybeSingle();
  if (!config?.enabled) {
    return NextResponse.json({ error: "This service isn't available right now" }, { status: 403 });
  }

  // Re-check the admin's per-service block list server-side (see
  // /admin/us-only -> UsOnlyOverridesManager, public.daisysim_usa_overrides)
  // — never trust that the client only ever showed services that weren't
  // disabled, same principle as re-validating price/balance below.
  const { data: override } = await admin
    .from("daisysim_usa_overrides")
    .select("disabled")
    .eq("service_code", serviceCode)
    .maybeSingle();
  if (override?.disabled) {
    return NextResponse.json({ error: "This service isn't available right now" }, { status: 403 });
  }

  const { data: usdRateRow } = await admin
    .from("currency_rates")
    .select("ngn_per_unit")
    .eq("currency", "USD")
    .maybeSingle();
  const usdRate = usdRateRow ? Number(usdRateRow.ngn_per_unit) : null;
  if (!usdRate) {
    return NextResponse.json({ error: "Pricing isn't set up yet." }, { status: 503 });
  }

  const { data: profile } = await admin.from("profiles").select("balance").eq("id", user.id).single();

  // Pre-check only — an estimate from whatever the client last saw, used to
  // avoid needlessly spending DaisySim balance on an order the customer
  // clearly can't afford. Not what they'll actually be charged.
  const estimatedPrice = computeNgnPrice(priceUsd, usdRate, config.markup_amount_ngn);
  if (!estimatedPrice || estimatedPrice <= 0) {
    return NextResponse.json({ error: "Could not price this number — try again." }, { status: 400 });
  }
  if (Number(profile?.balance || 0) < estimatedPrice) {
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 402 });
  }

  // DaisySim resolves the live price itself from `app` alone — no price is
  // sent, and none would be honored if it were.
  let purchase;
  try {
    purchase = await purchaseNumber({
      country: "USA",
      app: serviceCode,
      appName: serviceName,
      countryName: "USA",
    });
  } catch (err) {
    if (err instanceof DaisySimUsaError) {
      const messages = {
        INSUFFICIENT_BALANCE: "This service is temporarily unavailable. Please contact support.",
        PRICE_VERIFICATION_FAILED: "That price just expired — pick the service again.",
        INVALID_PRICE: "That price just expired — pick the service again.",
        OUT_OF_STOCK: "No numbers are available for this service right now.",
        PROVIDER_DISABLED: "This service isn't available right now.",
        RATE_LIMITED: "Too many requests — wait a moment and try again.",
      };
      return NextResponse.json(
        { error: messages[err.code] || "Could not rent a number right now." },
        { status: 502 }
      );
    }
    throw err;
  }

  // The real, final charge — what DaisySim actually debited, which may
  // differ slightly from `estimatedPrice` if the live price moved between
  // the client's last fetch and this purchase.
  const customerPrice = computeNgnPrice(purchase.amountCharged, usdRate, config.markup_amount_ngn);

  if (!customerPrice || customerPrice <= 0) {
    try {
      await cancelActivation(purchase.activationId);
    } catch {
      // best effort only
    }
    return NextResponse.json({ error: "Could not price this number — try again." }, { status: 500 });
  }

  // Re-check against the REAL price, not the estimate.
  if (Number(profile?.balance || 0) < customerPrice) {
    try {
      await cancelActivation(purchase.activationId);
    } catch {
      // best effort only — DaisySim only allows cancelling 180s+ after
      // purchase, so this will likely fail (TOO_EARLY) immediately after a
      // fresh purchase. Acceptable gap, same as the other providers.
    }
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 402 });
  }

  const { data: rental, error: insertError } = await admin
    .from("rentals")
    .insert({
      user_id: user.id,
      provider: "daisysim_usa",
      daisysim_usa_activation_id: purchase.activationId,
      phone_number: purchase.phoneNumber,
      price: customerPrice, // NGN — what the customer is actually charged
      cost_usd: purchase.amountCharged, // USD — what DaisySim actually charged us
      country_name: "USA",
      service_code: serviceCode,
      service_name: serviceName || purchase.service,
      status: "waiting",
      is_long_term: false,
    })
    .select()
    .single();

  if (insertError || !rental) {
    try {
      await cancelActivation(purchase.activationId);
    } catch {
      // best effort only
    }
    return NextResponse.json({ error: "Could not save the rental. Please try again." }, { status: 500 });
  }

  try {
    await admin.rpc("adjust_balance", {
      p_user_id: user.id,
      p_amount: -customerPrice,
      p_type: "purchase",
      p_reference_id: rental.id,
      p_note: `Purchased ${serviceName || serviceCode} number ${rental.phone_number} (US only)`,
      p_created_by: null,
    });
  } catch (err) {
    // Balance changed between our pre-check and now (e.g. concurrent
    // purchase). Undo: best-effort cancel with DaisySim and mark cancelled.
    try {
      await cancelActivation(purchase.activationId);
    } catch {
      // best effort only
    }
    await admin.from("rentals").update({ status: "cancelled" }).eq("id", rental.id);
    return NextResponse.json({ error: "Insufficient balance at time of purchase." }, { status: 402 });
  }

  return NextResponse.json({ rental });
}
