import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelOrders, getOrderStatus, SocialBoostError } from "@/lib/socialboost";
import { safeErrorResponse, customerSafeMessage } from "@/lib/apiError";
import { logError, customerErrorMessage } from "@/lib/errorLog";

// Recognizes the panel's own "already cancelled/completed" error text on a
// cancel attempt, so that's treated as a successful idempotent no-op rather
// than a hard failure (our own record was just stale).
const ALREADY_DONE_RE = /already.*(cancel|complete)/i;

// The panel's documented multi-order response shape is an array of
// { order, cancel } objects — but "Lord of Panels" (and other clones of this
// same API spec) have been observed returning the SINGLE result object
// directly, unwrapped, when only one order id was requested. Silently
// assuming the array shape and reading `results[0]` in that case yields
// `undefined`, which the old code then treated as "no error -> success" —
// i.e. it reported a cancel as successful without ever actually confirming
// it. This normalizes every shape we've seen (or could plausibly see) into
// the one `cancel` value, and returns `undefined` — never a made-up success
// value — when the shape genuinely isn't recognized, so the caller can tell
// the difference between "confirmed" and "couldn't confirm."
function extractCancelResult(response, providerOrderId) {
  if (Array.isArray(response)) {
    const match = response.find((r) => String(r?.order) === String(providerOrderId)) || response[0];
    return match ? match.cancel : undefined;
  }
  if (response && typeof response === "object") {
    if ("cancel" in response) return response.cancel;
    if (Array.isArray(response.orders)) {
      const match =
        response.orders.find((r) => String(r?.order) === String(providerOrderId)) || response.orders[0];
      return match ? match.cancel : undefined;
    }
  }
  return undefined;
}

// Not every service supports cancellation (see the `cancel` boolean on each
// service in /services) — the panel just returns an error for that order id
// if it doesn't, which is surfaced as-is rather than guessed at up front.
//
// End-to-end flow, rewritten for reliability:
//   1. Short-circuit as a no-op success if this order is already fully
//      cancelled+refunded on OUR side — makes a double-tapped button, a
//      retried request, or a second browser tab all safe.
//   2. Reject up front (no provider call at all) if the order already
//      reached a terminal 'Completed' state — nothing to cancel.
//   3. Call the provider's cancel endpoint and normalize its response
//      shape (see extractCancelResult above) instead of assuming one.
//   4. If the provider says it's already cancelled/completed on ITS side
//      (a real possibility if our own record is stale), treat that as
//      success rather than an error — same idempotency guarantee as step 1,
//      just discovered a step later.
//   5. On confirmed cancellation, immediately re-fetch the order's real
//      status from the provider (rather than assuming a string) so what we
//      store actually matches what the provider now reports.
//   6. Claim the status transition AND the refund atomically (WHERE
//      refunded_at IS NULL), crediting only the undelivered portion of the
//      order (remains/quantity of the original price) — never more than
//      what wasn't actually delivered. If the post-cancel status check
//      itself fails, the cancellation is still recorded but the refund is
//      deliberately withheld and flagged for admin review rather than
//      guessing an amount.
export async function POST(_request, { params }) {
  const { user, profile } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const isAdminCaller = isAdmin(profile);
  const admin = createAdminClient();
  const { data: order } = await admin.from("social_boost_orders").select("*").eq("id", params.id).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!isAdminCaller && order.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Step 1: already fully processed on our side — nothing to do.
  if (order.refunded_at || order.status === "Canceled" || order.status === "Cancelled") {
    return NextResponse.json({ order });
  }

  // Step 2: nothing left to cancel.
  if (order.status === "Completed") {
    return NextResponse.json({ error: "This order has already completed — it can't be cancelled." }, { status: 400 });
  }

  let cancelResult;
  try {
    const results = await cancelOrders([order.provider_order_id]);
    cancelResult = extractCancelResult(results, order.provider_order_id);
  } catch (err) {
    if (err instanceof SocialBoostError) {
      const message = await customerSafeMessage(err, {
        isAdminCaller,
        route: "/api/social-boost/orders/[id]/cancel",
        userId: user.id,
        context: { orderId: order.id },
      });
      return NextResponse.json({ error: message }, { status: err.status || 502 });
    }
    return safeErrorResponse(err, { route: "/api/social-boost/orders/[id]/cancel", userId: user.id });
  }

  let confirmedByProvider = false;
  if (cancelResult && typeof cancelResult === "object" && cancelResult.error) {
    const msg = String(cancelResult.error);
    if (ALREADY_DONE_RE.test(msg)) {
      // Step 4: our record was stale — the provider says it's already done.
      confirmedByProvider = true;
    } else if (isAdminCaller) {
      return NextResponse.json({ error: msg }, { status: 400 });
    } else {
      // The panel's own raw error text — never customer-safe (see
      // lib/apiError.js's customerSafeMessage for the same pattern used just
      // above for thrown SocialBoostErrors; this one isn't a thrown error at
      // all, just an error string in a successful response body, so it's
      // logged directly here instead).
      const referenceId = await logError({
        error: msg,
        route: "/api/social-boost/orders/[id]/cancel",
        userId: user.id,
        context: { orderId: order.id, providerOrderId: order.provider_order_id },
      });
      return NextResponse.json({ error: customerErrorMessage(referenceId) }, { status: 400 });
    }
  } else if (cancelResult === undefined) {
    // Response shape we couldn't recognize at all — never silently treat
    // this as success (that was the original bug). Log the raw shape for
    // debugging and tell the customer to retry rather than lying about the
    // outcome.
    console.error(
      `[social-boost/cancel] unrecognized cancel response for order ${order.id} (provider order ${order.provider_order_id})`
    );
    return NextResponse.json(
      { error: "Could not confirm the cancellation with the provider — please try again in a moment." },
      { status: 502 }
    );
  } else {
    confirmedByProvider = true;
  }

  if (!confirmedByProvider) {
    return NextResponse.json({ error: "Could not cancel this order." }, { status: 502 });
  }

  // Step 5: get the provider's own current view rather than assuming a
  // status string — the exact same call the manual "Refresh" button makes.
  let freshStatus = null;
  let statusCheckFailed = false;
  try {
    freshStatus = await getOrderStatus(order.provider_order_id);
  } catch (err) {
    statusCheckFailed = true;
    console.error(
      `[social-boost/cancel] post-cancel status check failed for order ${order.id}:`,
      err instanceof SocialBoostError ? err.message : err
    );
  }

  // Trust whatever the provider's status endpoint reports verbatim (it
  // should read "Canceled"/"Cancelled" per its own convention) — only fall
  // back to our own label when that follow-up call failed outright and we
  // have nothing from the provider to go on, given /cancel itself already
  // confirmed the cancellation succeeded.
  const resolvedStatus = freshStatus?.status || "Canceled";
  const remains = freshStatus?.remains != null ? Number(freshStatus.remains) : null;
  const now = new Date().toISOString();

  // Step 6: claim the cancellation atomically — refunded_at IS NULL is the
  // idempotency guard (same pattern as app/api/rentals/cancel), so this can
  // never fire twice for the same order even racing itself.
  const { data: claimed } = await admin
    .from("social_boost_orders")
    .update({
      status: resolvedStatus,
      remains: remains != null ? remains : order.remains,
      cancel_requested_at: order.cancel_requested_at || now,
      refunded_at: now,
      updated_at: now,
    })
    .eq("id", order.id)
    .is("refunded_at", null)
    .select()
    .maybeSingle();

  if (!claimed) {
    // Lost the race to a concurrent request that claimed it a moment
    // earlier — it's already handled, just return the current row.
    const { data: current } = await admin.from("social_boost_orders").select("*").eq("id", order.id).single();
    return NextResponse.json({ order: current });
  }

  // Couldn't confirm how much (if any) of the order was actually
  // delivered — record the cancellation but withhold the refund rather
  // than guess. Un-claims refunded_at so this stays visible as pending and
  // an admin can credit the right amount manually after checking the panel.
  if (statusCheckFailed || remains == null || !Number.isFinite(remains)) {
    const { data: flagged } = await admin
      .from("social_boost_orders")
      .update({
        refunded_at: null,
        refund_needs_review: true,
        cancel_error: "Cancelled, but the provider's post-cancel status couldn't be confirmed — refund needs manual review.",
      })
      .eq("id", claimed.id)
      .select()
      .single();
    return NextResponse.json({
      order: flagged || claimed,
      error: "Cancelled, but the refund needs admin review since the provider's status couldn't be confirmed.",
    });
  }

  // Only the undelivered portion is refunded — a partially-delivered order
  // (remains < quantity) gets a prorated credit, never the full price, and
  // an order that hadn't started at all (remains >= quantity) gets a full
  // refund, same as rentals' all-or-nothing cancel.
  const quantity = Number(order.quantity) || 0;
  const undeliveredRatio = quantity > 0 ? Math.min(remains, quantity) / quantity : 0;
  const refundNgn = Math.round(Number(order.price_ngn || 0) * undeliveredRatio * 100) / 100;

  if (refundNgn <= 0) {
    // Fully delivered by the time the cancel landed — nothing to refund,
    // but refunded_at (already set above) correctly marks this as settled
    // so it's never retried.
    return NextResponse.json({ order: claimed });
  }

  try {
    await admin.rpc("adjust_balance", {
      p_user_id: claimed.user_id,
      p_amount: refundNgn,
      p_type: "refund",
      p_reference_id: claimed.id,
      p_note: `Refund for cancelled Social Boost order #${claimed.provider_order_id} (${claimed.service_name || claimed.service_id}) — ${remains}/${quantity} units undelivered`,
      p_created_by: null,
    });
  } catch (err) {
    // Provider cancel already succeeded — can't undo that. Un-claim just
    // the refund so it isn't lost; there's no automatic sweep for Social
    // Boost (unlike rentals), so this is flagged for admin review too.
    console.error(`[social-boost/cancel] refund failed for order ${claimed.id}:`, err.message);
    await admin
      .from("social_boost_orders")
      .update({
        refunded_at: null,
        refund_needs_review: true,
        cancel_error: `refund failed: ${err.message}`.slice(0, 500),
      })
      .eq("id", claimed.id);
    return NextResponse.json({
      order: { ...claimed, refunded_at: null },
      error: "Cancelled, but the refund failed to process — support has been notified to review this.",
    });
  }

  return NextResponse.json({ order: claimed });
}
