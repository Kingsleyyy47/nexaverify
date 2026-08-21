import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrderStatus, learnStarCostFromOrder, IStarError } from "@/lib/istar";

// Manual poll fallback for when the webhook hasn't landed yet (or at all —
// e.g. local dev with no public URL registered in the iStar dashboard). Open
// to any logged-in customer, scoped to their own order (see the ownership
// check below). Applies the same completed/failed handling and refund
// idempotency as the webhook, keyed off the same refunded_at guard, so a
// webhook firing later can never double-refund an order this route already
// resolved (and vice versa).
export async function GET(request, { params }) {
  const { user, profile } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const admin_ = isAdmin(profile);

  const admin = createAdminClient();

  const { data: orderRow } = await admin
    .from("telegram_gift_orders")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!orderRow || orderRow.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Already resolved locally — no need to hit iStar again.
  if (orderRow.status === "completed" || orderRow.status === "failed") {
    return NextResponse.json({ order: orderRow });
  }

  let remote;
  try {
    remote = await getOrderStatus(orderRow.istar_order_id);
  } catch (err) {
    if (err instanceof IStarError) {
      return NextResponse.json(
        { error: admin_ ? err.message : "Could not check the order status — try again shortly." },
        { status: err.status || 502 }
      );
    }
    throw err;
  }

  const now = new Date().toISOString();

  if (remote.status === "completed") {
    const { data: updated } = await admin
      .from("telegram_gift_orders")
      .update({
        status: "completed",
        tx_hash: remote.tx_hash || null,
        updated_at: now,
      })
      .eq("id", orderRow.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();

    // Self-learning star pricing — see lib/istar.js#learnStarCostFromOrder.
    // `remote.amount` is the real, final charged amount reported directly by
    // iStar's own status endpoint.
    if (updated && updated.order_type === "star") {
      try {
        await learnStarCostFromOrder(admin, {
          quantity: updated.quantity,
          amount: remote.amount ?? updated.provider_amount,
          walletType: updated.wallet_type,
        });
      } catch (err) {
        console.error(`[telegram/orders/status] star cost learning failed for order ${updated.id}:`, err.message);
      }
    }

    return NextResponse.json({ order: updated || orderRow });
  }

  if (remote.status === "failed") {
    const { data: claimed } = await admin
      .from("telegram_gift_orders")
      .update({
        status: "failed",
        error_message: String(remote.error || "Order failed").slice(0, 500),
        refunded_at: now,
        updated_at: now,
      })
      .eq("id", orderRow.id)
      .is("refunded_at", null)
      .select()
      .maybeSingle();

    if (claimed) {
      try {
        await admin.rpc("adjust_balance", {
          p_user_id: claimed.user_id,
          p_amount: claimed.price,
          p_type: "refund",
          p_reference_id: claimed.id,
          p_note: `Refund for failed Telegram ${claimed.order_type} order (@${claimed.recipient_username})`,
          p_created_by: null,
        });
      } catch (err) {
        console.error(`[telegram/orders/status] refund failed for order ${claimed.id}:`, err.message);
        await admin.from("telegram_gift_orders").update({ refunded_at: null }).eq("id", claimed.id);
      }
      return NextResponse.json({ order: claimed });
    }
    return NextResponse.json({ order: orderRow });
  }

  // Still pending/processing on iStar's side — just reflect that if changed.
  if (remote.status && remote.status !== orderRow.status) {
    const { data: updated } = await admin
      .from("telegram_gift_orders")
      .update({ status: remote.status, updated_at: now })
      .eq("id", orderRow.id)
      .select()
      .maybeSingle();
    return NextResponse.json({ order: updated || orderRow });
  }

  return NextResponse.json({ order: orderRow });
}
