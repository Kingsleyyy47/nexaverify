import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmPayment, isSuccessfulStatus, isFailedStatus, PocketfiError } from "@/lib/pocketfi";
import { logError } from "@/lib/errorLog";

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
    if (err instanceof PocketfiError) {
      // Never put a caught provider error's raw message into this return
      // value — the redirect callback route hands the whole object straight
      // back as JSON with no filtering, so it would otherwise reach the
      // customer's browser verbatim. "pending" already communicates the
      // right state to the UI (retry shortly); the real detail is logged
      // instead, with a reference ID kept for admin lookup if it keeps
      // happening.
      const referenceId = await logError({
        error: err,
        route: "confirmAndCreditPocketfiPayment",
        userId: row.user_id,
        context: { paymentId },
      });
      return { outcome: "pending", referenceId };
    }
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

// Called from app/api/pocketfi/webhook when a bank-transfer-into-a-virtual-
// account event comes in. Unlike checkout, there's no redirect step to
// confirm against — the webhook is the ONLY signal we ever get that money
// landed, so this has to both match AND credit in one shot, safely.
//
// accountNumber is best-effort extracted from the webhook payload by the
// caller (PocketFi's documented payload doesn't show which field carries
// it — see the webhook route's comment), so this may simply not match
// anything for a while until the real field is confirmed in production.
// Returns one of:
//   { outcome: "credited", userId, amountNgn }
//   { outcome: "already_processed" }  -- this transfer's webhook fired twice
//   { outcome: "unmatched" }          -- couldn't tell which customer this was
//   { outcome: "lookup_failed", referenceId }  -- couldn't even query virtual_accounts
//   { outcome: "insert_failed", referenceId }  -- matched, but the ledger row itself failed
//   { outcome: "credit_failed", referenceId }  -- matched and recorded, but adjust_balance failed
export async function creditVirtualAccountFromWebhook({ accountNumber, reference, amountNgn }) {
  if (!accountNumber || !Number.isFinite(amountNgn) || amountNgn <= 0) {
    return { outcome: "unmatched" };
  }

  const admin = createAdminClient();

  // Try an exact match first, then fall back to a digits-only comparison in
  // case PocketFi's webhook formats the account number differently (spaces,
  // dashes) than what /virtual-accounts/create originally returned.
  const digitsOnly = String(accountNumber).replace(/\D/g, "");

  // Sept 2026 incident: this SELECT's `error` used to be silently dropped
  // (`const { data: accounts } = await ...`), so a transient blip talking to
  // Postgres made a real deposit look identical to "no such account" —
  // `accounts` fell back to `[]`, `match` came back undefined, and the
  // customer's money vanished with zero trace in any table or log. One retry
  // covers the transient case; if it fails twice in a row, log it loudly
  // instead of guessing.
  let accounts, accountsError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await admin
      .from("virtual_accounts")
      .select("user_id, account_number")
      .eq("provider", "pocketfi");
    accounts = result.data;
    accountsError = result.error;
    if (!accountsError) break;
  }

  if (accountsError) {
    const referenceId = await logError({
      error: accountsError,
      route: "creditVirtualAccountFromWebhook",
      context: { accountNumber, reference, amountNgn, stage: "virtual_accounts_lookup" },
    });
    return { outcome: "lookup_failed", referenceId };
  }

  const match = (accounts || []).find(
    (a) => a.account_number === accountNumber || a.account_number.replace(/\D/g, "") === digitsOnly
  );

  if (!match) return { outcome: "unmatched" };

  // Dedupe key: PocketFi's own "best practices" note says they may retry a
  // webhook delivery, and to check the reference before acting on it. Reuse
  // payment_transactions' existing (provider, payment_id) unique index for
  // this instead of a separate table — if reference is missing, fall back
  // to a synthetic id, which trades perfect dedup for at least not crashing
  // (a genuinely reference-less retry could theoretically double-credit;
  // flagged here rather than silently assumed away).
  const paymentId = reference || `va_${match.user_id}_${Date.now()}`;

  const { data: inserted, error: insertError } = await admin
    .from("payment_transactions")
    .insert({
      user_id: match.user_id,
      provider: "pocketfi_virtual_account",
      payment_id: paymentId,
      amount_ngn: amountNgn,
      confirmed_amount_ngn: amountNgn,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .select()
    .maybeSingle();

  if (insertError) {
    // Only a genuine unique (provider, payment_id) violation (Postgres
    // 23505) means this exact transfer already credited the wallet once —
    // that's the safe no-op case. Anything else (a transient connection
    // error, a schema mismatch) used to be treated the same way, which
    // silently reported success for a deposit that was never actually
    // recorded. Log those instead of assuming they're fine.
    if (insertError.code === "23505") {
      return { outcome: "already_processed" };
    }
    const referenceId = await logError({
      error: insertError,
      route: "creditVirtualAccountFromWebhook",
      userId: match.user_id,
      context: { accountNumber, reference, amountNgn, stage: "payment_transactions_insert" },
    });
    return { outcome: "insert_failed", referenceId };
  }

  const { error: creditError } = await admin.rpc("adjust_balance", {
    p_user_id: match.user_id,
    p_amount: amountNgn,
    p_type: "deposit",
    p_reference_id: inserted.id,
    p_note: "Wallet funded via PocketFi virtual account transfer",
    p_created_by: null,
  });

  if (creditError) {
    // Don't leave a 'completed' ledger row with no matching credit behind —
    // remove it so a corrected retry can re-insert cleanly.
    await admin.from("payment_transactions").delete().eq("id", inserted.id);
    // Return rather than throw: the webhook route's catch around this call
    // is an empty `catch {}` (deliberately, to avoid turning a credit
    // failure into a PocketFi retry storm), which means a thrown error here
    // used to vanish completely — not logged anywhere, not even to the
    // console. Returning an outcome lets the caller log it properly instead.
    const referenceId = await logError({
      error: creditError,
      route: "creditVirtualAccountFromWebhook",
      userId: match.user_id,
      context: { accountNumber, reference, amountNgn, stage: "adjust_balance" },
    });
    return { outcome: "credit_failed", referenceId };
  }

  return { outcome: "credited", userId: match.user_id, amountNgn };
}
