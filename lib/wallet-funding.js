import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmPayment, isSuccessfulStatus, isFailedStatus, PocketfiError } from "@/lib/pocketfi";

// The redirect callback only gets our own client_ref back (see the
// client_ref comment in supabase/schema.sql) — this resolves it to the
// row's actual PocketFi payment_id before handing off to
// confirmAndCreditPocketfiPayment below. Returns null if the ref is unknown.
export async function getPaymentIdByClientRef(clientRef) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("payment_transactions")
    .select("payment_id, user_id")
    .eq("client_ref", clientRef)
    .maybeSingle();
  return data ? { paymentId: data.payment_id, userId: data.user_id } : null;
}

// Shared by the redirect callback, the manual "Check status" retry, and
// (best-effort) the webhook — all three need to do the exact same thing:
// ask PocketFi for the real status of a payment, then credit the wallet
// exactly once. Returns one of:
//   { outcome: "credited", amountNgn }
//   { outcome: "already_processed" }   -- someone else's request won it
//   { outcome: "pending" }             -- customer hasn't finished paying yet
//   { outcome: "failed" }
//   { outcome: "not_found" }
export async function confirmAndCreditPocketfiPayment(paymentId, { userId } = {}) {
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("payment_transactions")
    .select("*")
    .eq("provider", "pocketfi")
    .eq("payment_id", paymentId)
    .maybeSingle();

  if (!row) return { outcome: "not_found" };
  // If a userId is supplied (customer-facing routes), don't let one
  // customer poll/confirm another customer's payment_id.
  if (userId && row.user_id !== userId) return { outcome: "not_found" };

  if (row.status === "completed") return { outcome: "already_processed" };
  if (row.status === "failed") return { outcome: "failed" };

  let confirmed;
  try {
    confirmed = await confirmPayment(paymentId);
  } catch (err) {
    if (err instanceof PocketfiError) return { outcome: "pending", error: err.message };
    throw err;
  }

  if (isFailedStatus(confirmed.status)) {
    await admin
      .from("payment_transactions")
      .update({ status: "failed" })
      .eq("id", row.id)
      .eq("status", "pending");
    return { outcome: "failed" };
  }

  if (!isSuccessfulStatus(confirmed.status)) {
    return { outcome: "pending" };
  }

  // Credit the amount PocketFi itself confirms was paid, not whatever we
  // originally asked for — that's the actual source of truth for money that
  // moved. Falls back to our own stored amount only if PocketFi's response
  // is missing it entirely.
  const amountNgn = confirmed.amount ?? Number(row.amount_ngn);

  // Atomic claim: this UPDATE only affects the row if it's STILL 'pending',
  // so if the redirect callback and a manual retry (or the webhook) both
  // reach here at nearly the same moment, only the first one gets rows
  // affected and only that one credits the wallet. The second call sees
  // rowCount 0 and reports "already_processed" instead of crediting twice.
  const { data: claimed } = await admin
    .from("payment_transactions")
    .update({
      status: "completed",
      confirmed_amount_ngn: amountNgn,
      completed_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (!claimed) return { outcome: "already_processed" };

  const { error: creditError } = await admin.rpc("adjust_balance", {
    p_user_id: row.user_id,
    p_amount: amountNgn,
    p_type: "deposit",
    p_reference_id: row.id,
    p_note: "Wallet funded via PocketFi",
    p_created_by: null,
  });

  if (creditError) {
    // We already marked this 'completed' to prevent a double-credit race,
    // but the actual credit failed — flip it back to 'pending' so a retry
    // (manual "Check status" button, or the next webhook delivery) can
    // still pick it up instead of the money silently vanishing.
    await admin
      .from("payment_transactions")
      .update({ status: "pending", confirmed_amount_ngn: null, completed_at: null })
      .eq("id", row.id);
    throw new Error(`Payment confirmed by PocketFi but wallet credit failed: ${creditError.message}`);
  }

  return { outcome: "credited", amountNgn };
}
