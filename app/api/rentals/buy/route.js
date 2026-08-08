import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNumber, cancelRental, DaisyError } from "@/lib/daisy";

// NexaVerify charges customers in NGN using the admin-set `customer_price`
// on the service (see /admin/products) — NOT whatever DaisySMS's live USD
// price happens to be. DaisySMS is only ever paid in USD, capped at the
// cached `last_price` from the last sync. The difference between what the
// customer pays (customer_price, NGN) and what DaisySMS actually charges
// (cost_usd, USD) is NexaVerify's margin — both are stored on the rental.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { serviceId, duration } = await request.json();
  if (!serviceId) return NextResponse.json({ error: "serviceId is required" }, { status: 400 });

  // duration is a string like "1D" / "12H" / "1M" for long-term rentals, or
  // omitted entirely for a normal short-term (5-15 min) rental.
  const isLongTerm = Boolean(duration);

  const admin = createAdminClient();

  // Master on/off switch (see /admin/providers, public.daisysms_config) —
  // checked here server-side so a stale link or a direct API call can't
  // buy while DaisySMS is switched off, even if the customer-facing UI is
  // hidden. Fails OPEN (missing row = still enabled) so a schema.sql that
  // hasn't been re-run yet doesn't silently break every purchase.
  const { data: providerConfig } = await admin.from("daisysms_config").select("enabled").eq("id", true).maybeSingle();
  if (providerConfig && !providerConfig.enabled) {
    return NextResponse.json({ error: "This service isn't available right now" }, { status: 403 });
  }

  const { data: service } = await admin.from("services").select("*").eq("id", serviceId).single();
  if (!service || !service.enabled) {
    return NextResponse.json({ error: "This service isn't available right now" }, { status: 403 });
  }

  const customerPrice = Number(service.customer_price);
  if (!customerPrice || customerPrice <= 0) {
    return NextResponse.json(
      { error: "This product hasn't been priced yet — check back soon." },
      { status: 403 }
    );
  }

  if (Number(profile.balance) < customerPrice) {
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 402 });
  }

  // Cap what DaisySMS can charge NexaVerify's master account at the last
  // synced cost. If the live price has since risen above this, the call
  // fails closed (MAX_PRICE_EXCEEDED) rather than silently eating the
  // difference out of NexaVerify's margin — re-sync services if that happens.
  //
  // NOTE: auto_renew is deliberately not offered/passed here. It maps to a
  // DaisySMS action (setAutoRenew) that isn't in .io's published API docs —
  // unverified against this account, so removed from the customer-facing
  // flow entirely rather than left as a control that might silently fail.
  let daisyResult;
  try {
    daisyResult = await getNumber({
      service: serviceId,
      maxPrice: service.last_price || undefined,
      duration: isLongTerm ? duration : undefined,
    });
  } catch (err) {
    if (err instanceof DaisyError) {
      const messages = {
        MAX_PRICE_EXCEEDED: "This product's cost has changed — an admin needs to re-sync and re-price it.",
        NO_NUMBERS: "No numbers are available for this service right now.",
        TOO_MANY_ACTIVE_RENTALS: "You've reached the limit of active rentals. Finish or cancel one first.",
        NO_MONEY: "This service is temporarily unavailable. Please contact support.",
      };
      // Log the RAW DaisySMS response for anything not in the friendly-message
      // map above (e.g. BAD_KEY, UNKNOWN_RESPONSE, TIMEOUT, NETWORK_ERROR) —
      // those all currently show the same generic customer-facing message, so
      // this is the only place the actual cause is visible. Check Vercel's
      // deployment -> Functions -> Logs for this line if purchases start
      // failing with "Could not rent a number right now."
      if (!messages[err.code]) {
        console.error(`[rentals/buy] DaisySMS getNumber failed for service "${serviceId}":`, err.code, err.message);
      }
      return NextResponse.json(
        { error: messages[err.code] || "Could not rent a number right now." },
        { status: 502 }
      );
    }
    console.error(`[rentals/buy] Unexpected (non-DaisyError) failure for service "${serviceId}":`, err);
    return NextResponse.json({ error: "Could not rent a number right now. Please try again." }, { status: 502 });
  }

  const { data: rental, error: insertError } = await admin
    .from("rentals")
    .insert({
      user_id: user.id,
      daisy_id: daisyResult.daisyId,
      service_id: serviceId,
      phone_number: daisyResult.phoneNumber,
      price: customerPrice, // NGN — what the customer is charged
      cost_usd: daisyResult.price, // USD — what DaisySMS actually charged us
      status: "waiting",
      is_long_term: isLongTerm,
      auto_renew: false,
    })
    .select()
    .single();

  if (insertError || !rental) {
    // We already spent DaisySMS balance renting this number — try to cancel
    // it back rather than silently losing it.
    try {
      await cancelRental(daisyResult.daisyId);
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
      p_note: `Purchased ${serviceId} number ${rental.phone_number}`,
      p_created_by: null,
    });
  } catch (err) {
    // Balance changed between our pre-check and now (e.g. concurrent
    // purchase). Undo: cancel with DaisySMS and mark the rental cancelled.
    try {
      await cancelRental(daisyResult.daisyId);
    } catch {
      // best effort only
    }
    await admin.from("rentals").update({ status: "cancelled" }).eq("id", rental.id);
    return NextResponse.json({ error: "Insufficient balance at time of purchase." }, { status: 402 });
  }

  return NextResponse.json({ rental });
}
