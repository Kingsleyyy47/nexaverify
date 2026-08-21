import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPremiumOrder, getPremiumPackages, computeNgnPrice, IStarError } from "@/lib/istar";

// Admin-only, deliberately — see istar_config in schema.sql. Debits the
// CALLING admin's own NGN wallet, exactly like a real customer purchase
// would. Unlike star gifting, iStar exposes a live price for premium
// packages (getPremiumPackages()), so this prices the same way DaisySim
// does: live USD value x currency_rates rate + admin's flat NGN markup.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
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

  const { data: config } = await admin
    .from("istar_config")
    .select("enabled, markup_amount_ngn")
    .eq("id", true)
    .maybeSingle();
  if (!config?.enabled) {
    return NextResponse.json({ error: "Telegram gifting isn't enabled yet — turn it on in admin settings first." }, { status: 403 });
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
      return NextResponse.json({ error: err.message }, { status: err.status || 502 });
    }
    throw err;
  }
  const pkg = (packages || []).find((p) => p.months === m);
  if (!pkg) {
    return NextResponse.json({ error: `No package found for ${m} months.` }, { status: 502 });
  }

  const price = computeNgnPrice(pkg.usd_value, usdRate, config.markup_amount_ngn);
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
      return NextResponse.json({ error: err.message }, { status: err.status || 502 });
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
