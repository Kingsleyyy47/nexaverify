import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServices, placeOrder, SocialBoostError } from "@/lib/socialboost";

// Admins can always reach this (their own testing flow, gated only by
// `enabled`) — everyone else additionally needs
// social_boost_config.customer_visible, same two-switch shape as iStar (see
// that column's comment in schema.sql). Debits the CALLING user's own NGN
// wallet either way.
function customerSafeMessage(err, isAdminCaller) {
  return isAdminCaller ? err.message : "Something went wrong placing this order — try again shortly.";
}

export async function GET() {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: orders } = await admin
    .from("social_boost_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ orders: orders || [] });
}

export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const isAdminCaller = isAdmin(profile);

  const { serviceId, link, quantity, runs, interval } = await request.json();
  const service = Number(serviceId);
  const qty = Number(quantity);
  if (!Number.isInteger(service) || service <= 0) {
    return NextResponse.json({ error: "Pick a service" }, { status: 400 });
  }
  if (!link || typeof link !== "string") {
    return NextResponse.json({ error: "Enter a link" }, { status: 400 });
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    return NextResponse.json({ error: "Enter a valid quantity" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: config } = await admin.from("social_boost_config").select("*").eq("id", true).maybeSingle();
  if (!config?.enabled) {
    return NextResponse.json({ error: "Social Boost isn't enabled yet — turn it on in admin settings first." }, { status: 403 });
  }
  if (!isAdminCaller && !config.customer_visible) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Re-fetch the live catalog server-side rather than trusting a client-sent
  // rate/name — the same reasoning as every other buy route in this app: the
  // price actually charged must come from a source we control, not the
  // request body.
  let matchedService;
  try {
    const services = await getServices();
    matchedService = (Array.isArray(services) ? services : []).find((s) => Number(s.service) === service);
  } catch (err) {
    if (err instanceof SocialBoostError) {
      return NextResponse.json({ error: customerSafeMessage(err, isAdminCaller) }, { status: err.status || 502 });
    }
    throw err;
  }

  if (!matchedService) {
    return NextResponse.json({ error: "That service is no longer available — refresh the service list." }, { status: 400 });
  }

  // Blocks purchase server-side regardless of caller (including an admin) —
  // an admin disabled this specific service via /admin/social-boost's
  // catalog manager, without touching the global on/off switch. Re-enable it
  // there to test it again.
  const { data: override } = await admin
    .from("social_boost_overrides")
    .select("*")
    .eq("service_id", service)
    .maybeSingle();
  if (override && override.enabled === false) {
    return NextResponse.json({ error: "This service is currently unavailable." }, { status: 403 });
  }

  const min = Number(matchedService.min);
  const max = Number(matchedService.max);
  if ((Number.isFinite(min) && qty < min) || (Number.isFinite(max) && qty > max)) {
    return NextResponse.json({ error: `Quantity must be between ${matchedService.min} and ${matchedService.max}` }, { status: 400 });
  }

  // rate is price per 1000 units, in USD, converted to NGN at the admin-set
  // rate — plus this specific service's own flat markup_ngn override, if an
  // admin has set one (bulk-applied or edited individually at
  // /admin/social-boost — see public.social_boost_overrides). Defaults to 0
  // (no markup) until an admin sets one.
  const { data: usdRateRow } = await admin
    .from("currency_rates")
    .select("ngn_per_unit")
    .eq("currency", "USD")
    .maybeSingle();
  const usdRate = usdRateRow ? Number(usdRateRow.ngn_per_unit) : null;
  if (!usdRate) {
    return NextResponse.json({ error: "No USD exchange rate configured — set one at /admin/currency first." }, { status: 400 });
  }

  const costUsd = (Number(matchedService.rate) / 1000) * qty;
  const costNgn = costUsd * usdRate;
  const hasCustomMarkup = Boolean(override?.markup_custom);
  const effectiveMarkupType = hasCustomMarkup
    ? override?.markup_type === "percent" ? "percent" : "flat"
    : config?.markup_type === "percent" ? "percent" : "flat";
  const effectiveMarkupPercent = hasCustomMarkup
    ? Number(override?.markup_percent || 0)
    : Number(config?.markup_percent || 0);
  const effectiveMarkupNgn = hasCustomMarkup
    ? Number(override?.markup_ngn || 0)
    : Number(config?.markup_ngn || 0);
  // Percent-mode markup scales with the order's own cost (so a bigger
  // quantity means a bigger markup, same rate); flat mode adds the same
  // amount once regardless of quantity — see the schema.sql comment on
  // social_boost_overrides.markup_type for why both exist.
  const priceNgn =
    effectiveMarkupType === "percent"
      ? Math.max(0, Math.round((costNgn * (1 + effectiveMarkupPercent / 100)) * 100) / 100)
      : Math.max(0, Math.round((costNgn + effectiveMarkupNgn) * 100) / 100);
  if (!priceNgn || priceNgn <= 0) {
    return NextResponse.json({ error: "Could not compute a price for this order." }, { status: 400 });
  }

  const { data: buyerProfile } = await admin.from("profiles").select("balance").eq("id", user.id).single();
  if (Number(buyerProfile?.balance || 0) < priceNgn) {
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 402 });
  }

  // Place with the provider FIRST — nothing is charged locally until they
  // actually accept it, same reasoning as every other provider wrapper here:
  // fail before touching the wallet, not after.
  let providerOrder;
  try {
    providerOrder = await placeOrder({
      service,
      link,
      quantity: qty,
      runs: runs || undefined,
      interval: interval || undefined,
    });
  } catch (err) {
    if (err instanceof SocialBoostError) {
      return NextResponse.json({ error: customerSafeMessage(err, isAdminCaller) }, { status: err.status || 502 });
    }
    throw err;
  }

  if (!providerOrder?.order) {
    return NextResponse.json({ error: "The provider didn't return an order ID — nothing was charged." }, { status: 502 });
  }

  const { data: orderRow, error: insertError } = await admin
    .from("social_boost_orders")
    .insert({
      user_id: user.id,
      provider_order_id: String(providerOrder.order),
      service_id: service,
      service_name: matchedService.name || null,
      link,
      quantity: qty,
      runs: runs ? Number(runs) : null,
      interval_minutes: interval ? Number(interval) : null,
      price_ngn: priceNgn,
      charge: costUsd,
      currency: "USD",
      status: "Pending",
    })
    .select()
    .single();

  if (insertError || !orderRow) {
    // The provider order is already placed and real money is already
    // committed on their side — no undo. Surface the provider order id so it
    // can be reconciled by hand.
    console.error(`[social-boost/orders] order ${providerOrder.order} placed but DB insert failed:`, insertError?.message);
    return NextResponse.json(
      {
        error: isAdminCaller
          ? `Order placed with the provider (#${providerOrder.order}) but could not be saved — contact support with this ID.`
          : `Your order was placed but could not be saved — contact support and mention reference ${providerOrder.order}.`,
      },
      { status: 500 }
    );
  }

  try {
    await admin.rpc("adjust_balance", {
      p_user_id: user.id,
      p_amount: -priceNgn,
      p_type: "purchase",
      p_reference_id: orderRow.id,
      p_note: `Social Boost: ${qty}x ${matchedService.name || `service #${service}`}`,
      p_created_by: null,
    });
  } catch (err) {
    console.error(`[social-boost/orders] order ${orderRow.id} placed but wallet debit failed:`, err.message);
  }

  return NextResponse.json({ order: orderRow, priceNgn });
}
