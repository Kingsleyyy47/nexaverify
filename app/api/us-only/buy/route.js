import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { purchaseNumber, computeNgnPrice, cancelActivation, GetatextError } from "@/lib/getatext";
import {
  purchaseNumber as purchaseNumberUsa,
  cancelActivation as cancelActivationUsa,
  DaisySimUsaError,
} from "@/lib/daisysimUsa";
import { safeErrorResponse } from "@/lib/apiError";

// Buys a number via the "US Only" provider (third provider slot alongside
// DaisySMS and "All countries" DaisySim). Backed by ONE of two
// interchangeable backends — Getatext (lib/getatext.js) or DaisySim's own
// dedicated USA "server7" API (lib/daisysimUsa.js) — chosen by
// daisysim_usa_config.backend and never both at once. Which backend actually
// fulfilled THIS rental is stamped onto the row (us_only_backend +
// backend-specific activation-id column) so a later admin toggle flip can
// never change which provider a given rental is checked/cancelled against.
// Same pricing-safety pattern as app/api/international/buy/route.js either
// way: both backends resolve price server-side from the service code alone
// and ignore any price sent to them, so `priceUsd` from the client (whatever
// lib/usOnlyCatalog.js last showed them) is used ONLY as a pre-check
// estimate. The real, authoritative USD amount is `amountCharged` in the
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
    .select("enabled, markup_amount_ngn, backend")
    .eq("id", true)
    .maybeSingle();
  if (!config?.enabled) {
    return NextResponse.json({ error: "This service isn't available right now" }, { status: 403 });
  }
  const backend = config.backend === "daisysim" ? "daisysim" : "getatext";

  // Re-check the admin's per-service block list server-side (see
  // /admin/us-only -> UsOnlyOverridesManager, public.daisysim_usa_overrides)
  // — never trust that the client only ever showed services that weren't
  // disabled, same principle as re-validating price/balance below. Also
  // carries this service's own markup override, if an admin has set one —
  // see the big comment on daisysim_usa_overrides.markup_ngn in schema.sql.
  const { data: override } = await admin
    .from("daisysim_usa_overrides")
    .select("disabled, markup_ngn")
    .eq("service_code", serviceCode)
    .maybeSingle();
  if (override?.disabled) {
    return NextResponse.json({ error: "This service isn't available right now" }, { status: 403 });
  }

  const effectiveMarkupNgn = override?.markup_ngn != null ? Number(override.markup_ngn) : Number(config.markup_amount_ngn || 0);

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
  // avoid needlessly spending Getatext balance on an order the customer
  // clearly can't afford. Not what they'll actually be charged.
  const estimatedPrice = computeNgnPrice(priceUsd, usdRate, effectiveMarkupNgn);
  if (!estimatedPrice || estimatedPrice <= 0) {
    return NextResponse.json({ error: "Could not price this number — try again." }, { status: 400 });
  }
  if (Number(profile?.balance || 0) < estimatedPrice) {
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 402 });
  }

  // Both backends resolve the live price themselves from `app` (the service
  // code) alone — no price is sent, and none would be honored if it were.
  // Getatext doesn't hand back a machine-readable error code — just a
  // human-readable message (see lib/getatext.js) — already customer-safe (no
  // provider name or internal jargon), so it's shown through directly rather
  // than mapped from a code table. DaisySim USA does have machine-readable
  // codes (see lib/daisysimUsa.js) but no per-code friendly-message mapping
  // exists yet here either — its `message` field is likewise safe to show
  // as-is for the purchase-failure cases actually reachable from this route.
  let purchase;
  try {
    purchase =
      backend === "daisysim"
        ? await purchaseNumberUsa({ app: serviceCode, appName: serviceName })
        : await purchaseNumber({ app: serviceCode, appName: serviceName });
  } catch (err) {
    if (err instanceof GetatextError || err instanceof DaisySimUsaError) {
      return NextResponse.json({ error: err.message || "Could not rent a number right now." }, { status: 502 });
    }
    return safeErrorResponse(err, { route: "/api/us-only/buy", userId: user.id });
  }

  // Best-effort rollback helper — routes to whichever backend actually
  // fulfilled the purchase above, since the two have entirely separate
  // activation-id namespaces and cancel endpoints.
  async function cancelPurchase() {
    try {
      if (backend === "daisysim") {
        await cancelActivationUsa(purchase.activationId);
      } else {
        await cancelActivation(purchase.activationId);
      }
    } catch {
      // best effort only — Getatext's docs mention a wait (5 minutes on
      // accounts without immediate cancellation) before a fresh rental can
      // be cancelled, and DaisySim USA locks cancellation for the first 180s
      // after purchase, so this may well fail immediately after a purchase.
      // Acceptable gap, same as the other providers.
    }
  }

  // The real, final charge — what the provider actually debited, which may
  // differ slightly from `estimatedPrice` if the live price moved between
  // the client's last fetch and this purchase.
  const customerPrice = computeNgnPrice(purchase.amountCharged, usdRate, effectiveMarkupNgn);

  if (!customerPrice || customerPrice <= 0) {
    await cancelPurchase();
    return NextResponse.json({ error: "Could not price this number — try again." }, { status: 500 });
  }

  // Re-check against the REAL price, not the estimate.
  if (Number(profile?.balance || 0) < customerPrice) {
    await cancelPurchase();
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 402 });
  }

  const { data: rental, error: insertError } = await admin
    .from("rentals")
    .insert({
      user_id: user.id,
      provider: "daisysim_usa",
      us_only_backend: backend,
      ...(backend === "daisysim"
        ? { daisysim_server7_activation_id: purchase.activationId }
        : { daisysim_usa_activation_id: purchase.activationId }),
      phone_number: purchase.phoneNumber,
      price: customerPrice, // NGN — what the customer is actually charged
      cost_usd: purchase.amountCharged, // USD — what the provider actually charged us
      country_name: "USA",
      service_code: serviceCode,
      service_name: serviceName || purchase.service,
      status: "waiting",
      is_long_term: false,
    })
    .select()
    .single();

  if (insertError || !rental) {
    await cancelPurchase();
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
    // purchase). Undo: best-effort cancel with the provider and mark cancelled.
    await cancelPurchase();
    await admin.from("rentals").update({ status: "cancelled" }).eq("id", rental.id);
    return NextResponse.json({ error: "Insufficient balance at time of purchase." }, { status: 402 });
  }

  return NextResponse.json({ rental });
}
