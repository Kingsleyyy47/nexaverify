import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { purchaseNumber, computeNgnPrice, cancelActivation, DaisySimError } from "@/lib/daisysim";

// Buys an international number via DaisySim (second provider alongside
// DaisySMS — see lib/daisy.js's app/api/rentals/buy for that flow). Charges
// the customer in NGN the same way DaisySMS purchases do (see adjust_balance
// usage below), but since DaisySim has no pre-synced/admin-priced catalog,
// the NGN price is computed fresh here from the live USD tier price — never
// trust whatever NGN amount the client displayed, always recompute
// server-side from the same usdRate + markup used by /api/international/prices.
export async function POST(request) {
  const { user } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { countryId, countryName, serviceCode, serviceName, priceUsd } = await request.json();
  if (!countryId || !serviceCode || priceUsd == null) {
    return NextResponse.json(
      { error: "countryId, serviceCode, and priceUsd are required" },
      { status: 400 }
    );
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

  // Re-check the admin's per-combo block list server-side (see
  // /admin/international -> InternationalOverridesManager,
  // public.daisysim_overrides) — never trust that the client only ever
  // showed services that weren't disabled, same principle as re-validating
  // price/balance below rather than trusting whatever the client sent.
  const { data: override } = await admin
    .from("daisysim_overrides")
    .select("disabled")
    .eq("country_id", countryId)
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
  const customerPrice = computeNgnPrice(priceUsd, usdRate, config.markup_amount_ngn);

  if (!customerPrice || customerPrice <= 0) {
    return NextResponse.json({ error: "Could not price this number — try again." }, { status: 400 });
  }
  if (Number(profile?.balance || 0) < customerPrice) {
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 402 });
  }

  // priceUsd must reach DaisySim EXACTLY as /prices returned it — see the
  // big warning in their docs about INVALID_PRICE. It's a number here
  // because that's what the client got back from /api/international/prices,
  // which itself passed DaisySim's own `price` field straight through.
  let purchase;
  try {
    purchase = await purchaseNumber({
      country: countryId,
      service: serviceCode,
      price: priceUsd,
      serviceName,
    });
  } catch (err) {
    if (err instanceof DaisySimError) {
      const messages = {
        INSUFFICIENT_BALANCE: "This service is temporarily unavailable. Please contact support.",
        INVALID_PRICE: "That price just expired — pick a tier again.",
        NO_NUMBERS_AVAILABLE: "No numbers are available for this service right now.",
        RATE_LIMITED: "Too many requests — wait a moment and try again.",
      };
      return NextResponse.json(
        { error: messages[err.code] || "Could not rent a number right now." },
        { status: 502 }
      );
    }
    throw err;
  }

  const { data: rental, error: insertError } = await admin
    .from("rentals")
    .insert({
      user_id: user.id,
      provider: "daisysim",
      daisysim_activation_id: purchase.activationId,
      phone_number: purchase.phoneNumber,
      price: customerPrice, // NGN — what the customer is charged
      cost_usd: priceUsd, // USD — what DaisySim actually charged us
      country_name: countryName || purchase.country,
      service_code: serviceCode,
      service_name: serviceName || purchase.service,
      status: "waiting",
      is_long_term: false,
    })
    .select()
    .single();

  if (insertError || !rental) {
    // We already spent DaisySim balance renting this number — try to cancel
    // it back rather than silently losing it. DaisySim only allows
    // cancelling 120s+ after purchase, so this best-effort attempt will
    // likely fail (TOO_EARLY) immediately after a fresh purchase — that's
    // an acceptable gap, same as the equivalent DaisySMS rollback attempt.
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
      p_note: `Purchased ${serviceName || serviceCode} number ${rental.phone_number} (international)`,
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
