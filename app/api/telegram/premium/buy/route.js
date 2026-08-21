import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPremiumOrder, getPremiumPackages, buildPremiumPricing, IStarError } from "@/lib/istar";

// Admins can always reach this (their own testing flow, gated only by
// `enabled` below). Everyone else additionally needs
// istar_config.customer_visible — a separate, off-by-default flag from
// `enabled` (see that column's comment in schema.sql). Debits the CALLING
// user's own NGN wallet either way. Prices auto-sync live every time: fetch
// getPremiumPackages() fresh, convert THIS duration's usd_value at the
// current currency_rates USD rate, then add the admin's per-duration markup
// (premium_markup_3/6/12) on top — never a stale/cached number, so a change
// in iStar's own price never silently eats the margin.
function customerSafeMessage(err, admin) {
  return admin ? err.message : "Something went wrong placing this order — try again shortly.";
}

export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { username, recipientHash, months, walletType } = await request.json();
  const m = Number(months);
  if (!username || !recipientHash || ![3, 6, 12].includes(m)) {
    return NextResponse.json(
      { error: "username, recipientHash, and months (3, 6, or 12) are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const admin_ = isAdmin(profile);

  const { data: config } = await admin
    .from("istar_config")
    .select("enabled, customer_visible, premium_markup_3, premium_markup_6, premium_markup_12")
    .eq("id", true)
    .maybeSingle();
  if (!config?.enabled) {
    return NextResponse.json({ error: "Telegram gifting isn't enabled yet — turn it on in admin settings first." }, { status: 403 });
  }
  if (!admin_ && !config.customer_visible) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: usdRateRow } = await admin
    .from("currency_rates")
    .select("ngn_per_unit")
    .eq("currency", "USD")
    .maybeSingle();
  const usdRate = usdRateRow ? Number(usdRateRow.ngn_per_unit) : null;
  if (!usdRate) {
    return NextResponse.json({ error: "Pricing isn't set up yet — set a USD rate first." }, { status: 503 });
  }

  let packages;
  try {
    packages = await getPremiumPackages();
  } catch (err) {
    if (err instanceof IStarError) {
      return NextResponse.json({ error: customerSafeMessage(err, admin_) }, { status: err.status || 502 });
    }
    throw err;
  }

  const markups = {
    3: config.premium_markup_3,
    6: config.premium_markup_6,
    12: config.premium_markup_12,
  };
  const pricing = buildPremiumPricing(packages, usdRate, markups)[m];
  if (!pricing) {
    return NextResponse.json(
      { error: admin_ ? `No package found for ${m} months.` : "Could not price this package — try again shortly." },
      { status: 502 }
    );
  }
  const price = pricing.priceNgn;
  if (!price || price <= 0) {
    return NextResponse.json({ error: "Could not price this package — try again." }, { status: 400 });
  }

  const { data: buyerProfile } = await admin.from("profiles").select("balance").eq("id", user.id).single();
  if (Number(buyerProfile?.balance || 0) < price) {
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 402 });
  }

  // Same reasoning as the star route: create the order first, since there's
  // no documented way to cancel a placed iStar order, so we'd rather fail
  // before touching the wallet than after.
  let order;
  try {
    order = await createPremiumOrder({
      username,
      recipientHash,
      months: m,
      walletType: walletType || "TON",
    });
  } catch (err) {
    if (err instanceof IStarError) {
      return NextResponse.json({ error: customerSafeMessage(err, admin_) }, { status: err.status || 502 });
    }
    throw err;
  }

  const { data: orderRow, error: insertError } = await admin
    .from("telegram_gift_orders")
    .insert({
      user_id: user.id,
      order_type: "premium",
      istar_order_id: order.order_id,
      recipient_username: username,
      recipient_hash: recipientHash,
      months: m,
      price,
      provider_amount: order.amount ?? null,
      wallet_type: walletType || "TON",
      status: "pending",
    })
    .select()
    .single();

  if (insertError || !orderRow) {
    console.error(`[telegram/premium/buy] order ${order.order_id} placed but DB insert failed:`, insertError?.message);
    return NextResponse.json(
      {
        error: admin_
          ? `Order placed with iStar (${order.order_id}) but could not be saved — contact support with this ID.`
          : `Your order was placed but could not be saved — contact support and mention reference ${order.order_id}.`,
      },
      { status: 500 }
    );
  }

  try {
    await admin.rpc("adjust_balance", {
      p_user_id: user.id,
      p_amount: -price,
      p_type: "purchase",
      p_reference_id: orderRow.id,
      p_note: `${m}-month Telegram Premium for @${username}`,
      p_created_by: null,
    });
  } catch (err) {
    console.error(`[telegram/premium/buy] order ${orderRow.id} placed but wallet debit failed:`, err.message);
    await admin
      .from("telegram_gift_orders")
      .update({ error_message: `wallet debit failed: ${err.message}`.slice(0, 500) })
      .eq("id", orderRow.id);
  }

  return NextResponse.json({ order: orderRow });
}
