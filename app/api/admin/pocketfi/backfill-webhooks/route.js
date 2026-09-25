import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmAndCreditPocketfiPayment, creditVirtualAccountFromWebhook } from "@/lib/wallet-funding";

// One-time (and safe-to-rerun) recovery for the Sept 2026 silent-failure bug
// in creditVirtualAccountFromWebhook (see lib/wallet-funding.js): a real
// PocketFi webhook, correctly signed and correctly carrying the right
// account number, could still fail to credit a wallet if the
// virtual_accounts lookup hit a transient error, because that error used to
// be silently dropped. Every such event is still sitting in
// pocketfi_webhook_events with signature_valid=true and matched_payment_id
// still null — nothing was ever lost, it just never got matched.
//
// This walks every such row, re-derives the same candidate payment_id /
// account_number the live webhook route would have used, and calls the SAME
// (now-fixed) crediting functions. Both of those functions are already
// idempotent — a transfer that's already been credited comes back
// "already_processed" and is never charged twice — so this route is safe to
// run more than once if it's interrupted or if more unmatched rows show up
// later.
//
// GET  -> preview only. Shows what each unmatched row resolves to and
//         whether a matching virtual account exists, without touching
//         anything.
// POST -> actually credits. Updates each row's matched_payment_id /
//         matched_user_id once its transfer is credited (or found to
//         already have been), so a second run doesn't re-examine it.
export async function GET(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("pocketfi_webhook_events")
    .select("id, received_at, payload")
    .eq("signature_valid", true)
    .is("matched_payment_id", null)
    .order("received_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sept 2026 incident: this used to fetch the entire virtual_accounts table
  // once and match in JavaScript, which silently returned only a partial,
  // arbitrarily-ordered slice once the table passed Supabase's 1000-row
  // default cap on an unfiltered select. Looking each candidate account
  // number up directly means table size can't hide a real match again.
  const preview = [];
  for (const row of rows || []) {
    const { candidatePaymentId, candidateAccountNumber, amountNgn, reference } = deriveCandidates(row.payload);
    let wouldMatchAccount = null;
    if (candidateAccountNumber) {
      const digitsOnly = String(candidateAccountNumber).replace(/\D/g, "");
      const { data: matches } = await admin
        .from("virtual_accounts")
        .select("user_id, account_number")
        .eq("provider", "pocketfi")
        .or(`account_number.eq.${candidateAccountNumber},account_number.eq.${digitsOnly}`)
        .limit(5);
      wouldMatchAccount = (matches || []).find(
        (a) => a.account_number === candidateAccountNumber || a.account_number.replace(/\D/g, "") === digitsOnly
      );
    }

    preview.push({
      id: row.id,
      received_at: row.received_at,
      reference,
      candidatePaymentId,
      candidateAccountNumber,
      amountNgn,
      wouldMatchUserId: wouldMatchAccount?.user_id || null,
      resolvable: Boolean(candidatePaymentId || wouldMatchAccount),
    });
  }

  return NextResponse.json({
    totalUnmatched: preview.length,
    resolvable: preview.filter((p) => p.resolvable).length,
    unresolvable: preview.filter((p) => !p.resolvable).length,
    rows: preview,
  });
}

export async function POST() {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("pocketfi_webhook_events")
    .select("id, received_at, payload")
    .eq("signature_valid", true)
    .is("matched_payment_id", null)
    .order("received_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];

  for (const row of rows || []) {
    const { candidatePaymentId, candidateAccountNumber, amountNgn, reference } = deriveCandidates(row.payload);
    let matched = null;
    let matchedUserId = null;
    let outcome = "unresolvable";
    let creditedAmount = null;
    let referenceId = null;

    // Same two-attempt order as the live webhook route: checkout match
    // first, then virtual-account match, so a backfill run resolves a row
    // exactly the way it would have resolved live.
    if (candidatePaymentId) {
      const r = await confirmAndCreditPocketfiPayment(candidatePaymentId);
      if (r.outcome === "credited" || r.outcome === "already_processed") {
        matched = candidatePaymentId;
        outcome = r.outcome;
        creditedAmount = r.amountNgn ?? null;
      }
      if (r.referenceId) referenceId = r.referenceId;
    }

    if (!matched && candidateAccountNumber && amountNgn) {
      const r = await creditVirtualAccountFromWebhook({ accountNumber: candidateAccountNumber, reference, amountNgn });
      if (r.outcome === "credited" || r.outcome === "already_processed") {
        matched = reference || candidateAccountNumber;
        matchedUserId = r.userId || null;
        outcome = r.outcome;
        creditedAmount = r.outcome === "credited" ? amountNgn : creditedAmount;
      } else {
        outcome = r.outcome; // lookup_failed / insert_failed / credit_failed / unmatched
      }
      if (r.referenceId) referenceId = r.referenceId;
    }

    if (matched) {
      await admin
        .from("pocketfi_webhook_events")
        .update({ matched_payment_id: matched, matched_user_id: matchedUserId })
        .eq("id", row.id);
    }

    results.push({
      id: row.id,
      received_at: row.received_at,
      reference,
      candidateAccountNumber,
      amountNgn,
      outcome,
      creditedAmount,
      userId: matchedUserId,
      referenceId,
    });
  }

  return NextResponse.json({
    processed: results.length,
    credited: results.filter((r) => r.outcome === "credited").length,
    alreadyProcessed: results.filter((r) => r.outcome === "already_processed").length,
    stillFailed: results.filter((r) => ["lookup_failed", "insert_failed", "credit_failed"].includes(r.outcome)).length,
    unresolvable: results.filter((r) => r.outcome === "unresolvable" || r.outcome === "unmatched").length,
    results,
  });
}

// Mirrors app/api/pocketfi/webhook/route.js's own field-guessing exactly, so
// a backfill run resolves each stored payload the same way the live route
// would have.
function deriveCandidates(payload) {
  const reference = payload?.transaction?.reference || null;
  const amountNgn = payload?.order?.amount != null ? Number(payload.order.amount) : null;
  const candidatePaymentId = payload?.transaction?.payment_id || payload?.payment_id || reference || null;
  const candidateAccountNumber =
    payload?.transaction?.account_number ||
    payload?.account_number ||
    payload?.account?.number ||
    payload?.order?.account_number ||
    payload?.virtual_account?.account_number ||
    null;
  return { candidatePaymentId, candidateAccountNumber, amountNgn, reference };
}
