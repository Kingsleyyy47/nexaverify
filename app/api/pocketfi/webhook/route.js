import crypto from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmAndCreditPocketfiPayment, creditVirtualAccountFromWebhook } from "@/lib/wallet-funding";

// Receives real-time payment notifications from PocketFi (configured on
// their Dashboard -> Settings -> Webhooks). Always respond 2xx quickly once
// the signature checks out, per PocketFi's own retry-policy guidance.
//
// For checkout payments (provider 'pocketfi'), this is NOT the primary
// crediting mechanism — see the big comment in lib/pocketfi.js — the
// redirect callback is. But for virtual account transfers (provider
// 'pocketfi_virtual_account', now the default /topup funding method), this
// webhook is the ONLY signal we ever get that money arrived, since there's
// no redirect step for a bank transfer. Both matching attempts below are
// best-effort: PocketFi's documented payload (order + transaction.reference)
// doesn't show a payment_id OR an account number, so this checks several
// plausible field paths and logs everything to pocketfi_webhook_events so
// an admin can see what actually came through and refine this once real
// production payloads are observed.
export async function POST(request) {
  const secret = process.env.POCKETFI_SECRET_KEY;
  const rawBody = await request.text();

  // Capture every incoming header so we can see, from a real delivery,
  // exactly which one actually carries PocketFi's signature — added after
  // the first live webhook came back signature_valid=false with none of our
  // guessed header names matching. Nothing sensitive comes in on an inbound
  // webhook request, so logging all of them is safe.
  const headers = Object.fromEntries(request.headers.entries());

  // PHP's $_SERVER['HTTP_POCKETFI_SIGNATURE'] convention maps to an incoming
  // header PocketFi's own docs don't spell out consistently (their Node.js
  // example even reads a literal 'http_pocketfi_signature' header, which
  // isn't standard). Check every plausible spelling rather than guess wrong.
  const signature =
    request.headers.get("pocketfi-signature") ||
    request.headers.get("x-pocketfi-signature") ||
    request.headers.get("http_pocketfi_signature") ||
    request.headers.get("x-signature") ||
    request.headers.get("signature");

  let signatureValid = false;
  if (secret && signature) {
    const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
    try {
      signatureValid =
        expected.length === signature.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      signatureValid = false;
    }
  }

  let payload = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // fall through — still log the invalid body below
  }

  const admin = createAdminClient();

  if (!signatureValid) {
    await admin.from("pocketfi_webhook_events").insert({
      payload,
      headers,
      signature_valid: false,
    });
    return NextResponse.json({ message: "Invalid signature" }, { status: 400 });
  }

  const reference = payload?.transaction?.reference || null;
  const amountNgn = payload?.order?.amount != null ? Number(payload.order.amount) : null;

  let matched = null;
  let matchedUserId = null;

  // Attempt 1: checkout payment match. PocketFi's documented payload doesn't
  // include payment_id, only transaction.reference — check the reference
  // itself as a fallback in case that's actually what payment_id equals.
  const candidatePaymentId = payload?.transaction?.payment_id || payload?.payment_id || reference || null;
  if (candidatePaymentId) {
    try {
      const result = await confirmAndCreditPocketfiPayment(candidatePaymentId);
      if (result.outcome === "credited" || result.outcome === "already_processed") {
        matched = candidatePaymentId;
      }
    } catch {
      // Logged below regardless; don't let a credit error turn into a
      // webhook retry storm.
    }
  }

  // Attempt 2: virtual account transfer match — only if attempt 1 didn't
  // already claim this event. None of these field paths are confirmed by
  // PocketFi's docs; they're educated guesses at where an account number
  // might live in a real payload.
  if (!matched) {
    const candidateAccountNumber =
      payload?.transaction?.account_number ||
      payload?.account_number ||
      payload?.account?.number ||
      payload?.order?.account_number ||
      payload?.virtual_account?.account_number ||
      null;

    if (candidateAccountNumber && amountNgn) {
      try {
        const result = await creditVirtualAccountFromWebhook({
          accountNumber: candidateAccountNumber,
          reference,
          amountNgn,
        });
        if (result.outcome === "credited") {
          matched = reference || candidateAccountNumber;
          matchedUserId = result.userId;
        } else if (result.outcome === "already_processed") {
          matched = reference || candidateAccountNumber;
        }
      } catch {
        // Same reasoning as above — logged, not thrown, to avoid a retry storm.
      }
    }
  }

  await admin.from("pocketfi_webhook_events").insert({
    payload,
    headers,
    signature_valid: true,
    matched_payment_id: matched,
    matched_user_id: matchedUserId,
  });

  return NextResponse.json({ message: "success" });
}
