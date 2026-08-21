import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStarOrder, IStarError } from "@/lib/istar";

// Admins can always reach this (their own testing flow, gated only by
// `enabled` below). Everyone else additionally needs
// istar_config.customer_visible — a separate, off-by-default flag from
// `enabled` (see that column's comment in schema.sql). Debits the CALLING
// user's own NGN wallet either way.
//
// Price is admin-set (public.istar_config.ngn_per_star) rather than
// converted from a live rate, because iStar has no pre-purchase price
// lookup for star gifting — the real `amount` only comes back in the order
// creation response itself, which is stored as `provider_amount` for
// reference but does NOT change what the buyer is charged.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { username, recipientHash, quantity, walletType } = await request.json();
  const qty = Number(quantity);
  if (!username || !recipientHash || !Number.isInteger(qty) || qty < 50 || qty > 1_000_000) {
    return NextResponse.json(
      { error: "username, recipientHash, and a quantity between 50 and 1,000,000 are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: config } = await admin
    .from("istar_config")
    .select("enabled, customer_visible, ngn_per_star")
    .eq("id", true)
    .maybeSingle();
  if (!config?.enabled) {
    return NextResponse.json({ error: "Telegram gifting isn't enabled yet — turn it on in admin settings first." }, { status: 403 });
  }
  if (!isAdmin(profile) && !config.customer_visible) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const price = Math.max(0, Math.round(qty * Number(config.ngn_per_star || 0) * 100) / 100);
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
      return NextResponse.json({ error: err.message }, { status: err.status || 502 });
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
      { error: `Order placed with iStar (${order.order_id}) but could not be saved — contact support with this ID.` },
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
