import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStarOrder, computeStarTotalPrice, starConfigFromRow, IStarError } from "@/lib/istar";

// Admins can always reach this (their own testing flow, gated only by
// `enabled` below). Everyone else additionally needs
// istar_config.customer_visible — a separate, off-by-default flag from
// `enabled` (see that column's comment in schema.sql). Debits the CALLING
// user's own NGN wallet either way.
//
// Pricing self-learns over time (see lib/istar-pricing.js#computeStarTotalPrice,
// lib/istar.js#learnStarCostFromOrder): once at least one USDT-paid star
// order has actually completed, base cost per star = star_last_cost_ngn.
// Until then, it falls back to the static ngn_per_star guess. Two markup
// PROFILES exist side by side ("Old way", "New way"), each with its own
// ×/+ operator (see lib/istar-pricing.js for the exact math) —
// istar_config.star_pricing_mode picks which profile is actually charged;
// switching it doesn't require re-entering either profile's numbers or
// operator. The real `amount` iStar reports only comes back in the order
// creation response itself, stored as `provider_amount` for reference (and
// as learning input once it completes) but does NOT change what the buyer
// is charged for THIS order.
function customerSafeMessage(err, admin) {
  return admin ? err.message : "Something went wrong placing this order — try again shortly.";
}

export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const admin_ = isAdmin(profile);

  const { username, recipientHash, quantity, walletType } = await request.json();
  const qty = Number(quantity);
  if (!username || !recipientHash || !Number.isInteger(qty) || qty < 50 || qty > 1_000_000) {
    return NextResponse.json(
      { error: "username, recipientHash, and a quantity between 50 and 1,000,000 are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // select("*") on purpose — an explicit column list here would silently
  // break (query errors, config comes back null, price collapses) any time
  // a new istar_config column exists in code but the migration hasn't
  // landed on this DB yet.
  const { data: config } = await admin.from("istar_config").select("*").eq("id", true).maybeSingle();
  if (!config?.enabled) {
    return NextResponse.json({ error: "Telegram gifting isn't enabled yet — turn it on in admin settings first." }, { status: 403 });
  }
  if (!admin_ && !config.customer_visible) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Which profile is live ("Old way" vs "New way", each with its own ×/+
  // operator) is picked by star_pricing_mode — see lib/istar-pricing.js.
  const price = computeStarTotalPrice(starConfigFromRow(config), qty);
  if (!price || price <= 0) {
    return NextResponse.json({ error: "Set a price-per-star in admin settings before testing a purchase." }, { status: 400 });
  }

  const { data: buyerProfile } = await admin.from("profiles").select("balance").eq("id", user.id).single();
  if (Number(buyerProfile?.balance || 0) < price) {
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 402 });
  }

  // Create the order FIRST — nothing is charged locally until iStar
  // actually accepts it, since (unlike the phone-number providers) there's
  // no documented way to cancel/refund a star order on iStar's side once
  // placed, so we'd rather fail before touching the wallet than after.
  let order;
  try {
    order = await createStarOrder({
      username,
      recipientHash,
      quantity: qty,
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
      order_type: "star",
      istar_order_id: order.order_id,
      recipient_username: username,
      recipient_hash: recipientHash,
      quantity: qty,
      price,
      provider_amount: order.amount ?? null,
      wallet_type: walletType || "TON",
      status: "pending",
    })
    .select()
    .single();

  if (insertError || !orderRow) {
    // The iStar order is already placed and real TON/USDT is already
    // committed — there's no undo on their side, so this is a genuine "we
    // lost track of an order" scenario rather than a clean rollback. Surface
    // the iStar order_id so it can be reconciled by hand from the logs.
    console.error(`[telegram/star/buy] order ${order.order_id} placed but DB insert failed:`, insertError?.message);
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
      p_note: `${qty} Telegram Stars for @${username}`,
      p_created_by: null,
    });
  } catch (err) {
    // Same story — the iStar order is already real and irreversible.
    // Flag it rather than pretend a rollback is possible.
    console.error(`[telegram/star/buy] order ${orderRow.id} placed but wallet debit failed:`, err.message);
    await admin
      .from("telegram_gift_orders")
      .update({ error_message: `wallet debit failed: ${err.message}`.slice(0, 500) })
      .eq("id", orderRow.id);
  }

  return NextResponse.json({ order: orderRow });
}
