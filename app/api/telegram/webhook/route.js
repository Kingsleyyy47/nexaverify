import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { learnStarCostFromOrder } from "@/lib/istar";

// Receives order.completed / order.failed events from iStar (configured in
// their Developer Dashboard -> Webhooks). Unlike DaisySim/DaisySMS's
// shared-secret-in-the-URL convention, iStar signs the raw request body with
// HMAC-SHA256 and sends it in X-iStar-Signature — a stronger scheme, so this
// verifies it properly rather than reusing the query-string pattern. Must
// read the raw text body BEFORE parsing JSON, since the signature is over
// the exact raw bytes.
export async function POST(request) {
  const secret = process.env.ISTAR_WEBHOOK_SECRET;
  const signature = request.headers.get("x-istar-signature");
  const rawBody = await request.text();

  // iStar's own docs: "Skipping signature verification exposes your
  // application to spoofed webhook requests." So unlike some of this app's
  // other webhooks, a missing secret/signature is a hard failure here, not
  // an optional check.
  if (!secret || !signature) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  const valid = sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  if (!valid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event_type: eventType, order } = payload || {};
  if (!order?.id) {
    // Ack anyway — nothing to do, but no reason to make iStar retry.
    return NextResponse.json({ ok: true, matched: false });
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("telegram_gift_orders")
    .select("*")
    .eq("istar_order_id", order.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ ok: true, matched: false });
  }

  const now = new Date().toISOString();

  if (eventType === "order.completed") {
    const { data: updated } = await admin
      .from("telegram_gift_orders")
      .update({
        status: "completed",
        tx_hash: payload.tx_hash || order.payload?.tx_hash || null,
        updated_at: now,
      })
      .eq("id", existing.id)
      .eq("status", "pending") // don't clobber a status a status-poll already resolved
      .select()
      .maybeSingle();

    // Self-learning star pricing — see lib/istar.js#learnStarCostFromOrder.
    // `order.amount` is the real, final charged amount for this order (the
    // same field iStar's own docs show in the webhook payload example),
    // more authoritative than whatever was estimated at order-creation time.
    if (updated && updated.order_type === "star") {
      try {
        await learnStarCostFromOrder(admin, {
          quantity: updated.quantity,
          amount: order.amount ?? updated.provider_amount,
          walletType: updated.wallet_type,
        });
      } catch (err) {
        console.error(`[telegram/webhook] star cost learning failed for order ${updated.id}:`, err.message);
      }
    }

    return NextResponse.json({ ok: true, matched: true });
  }

  if (eventType === "order.failed") {
    // Atomic claim: only the first of {this webhook, a manual status poll}
    // to reach this UPDATE actually refunds — same idempotency pattern as
    // rentals.refunded_at.
    const { data: claimed } = await admin
      .from("telegram_gift_orders")
      .update({
        status: "failed",
        error_message: String(payload.error || order.payload?.reason || "Order failed").slice(0, 500),
        refunded_at: now,
        updated_at: now,
      })
      .eq("id", existing.id)
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
        // Un-claim just the refund so a later manual status check can retry
        // the credit without re-processing the failure itself.
        console.error(`[telegram/webhook] refund failed for order ${claimed.id}:`, err.message);
        await admin.from("telegram_gift_orders").update({ refunded_at: null }).eq("id", claimed.id);
      }
    }
    return NextResponse.json({ ok: true, matched: true });
  }

  return NextResponse.json({ ok: true, matched: false });
}
