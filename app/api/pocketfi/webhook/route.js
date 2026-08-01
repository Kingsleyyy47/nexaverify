import crypto from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmAndCreditPocketfiPayment } from "@/lib/wallet-funding";

// Receives real-time payment notifications from PocketFi (configured on
// their Dashboard -> Settings -> Webhooks). Always respond 2xx quickly once
// the signature checks out, per PocketFi's own retry-policy guidance.
//
// NOT the primary crediting mechanism — see the big comment in
// lib/pocketfi.js and the pocketfi_webhook_events table comment in
// supabase/schema.sql for why. This route verifies the signature, logs the
// payload for later debugging, and only attempts to credit a wallet in the
// (currently undocumented) case the payload includes something we can match
// back to a payment_transactions row.
export async function POST(request) {
  const secret = process.env.POCKETFI_SECRET_KEY;
  const rawBody = await request.text();

  // PHP's $_SERVER['HTTP_POCKETFI_SIGNATURE'] convention maps to an incoming
  // header PocketFi's own docs don't spell out consistently (their Node.js
  // example even reads a literal 'http_pocketfi_signature' header, which
  // isn't standard). Check every plausible spelling rather than guess wrong.
  const signature =
    request.headers.get("pocketfi-signature") ||
    request.headers.get("x-pocketfi-signature") ||
    request.headers.get("http_pocketfi_signature");

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
      signature_valid: false,
    });
    return NextResponse.json({ message: "Invalid signature" }, { status: 400 });
  }

  // Best-effort: PocketFi's documented payload doesn't include payment_id,
  // only transaction.reference — but check for it anyway in case their real
  // payload carries more fields than the docs show.
  const candidatePaymentId =
    payload?.transaction?.payment_id || payload?.payment_id || payload?.transaction?.reference || null;

  let matched = null;
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

  await admin.from("pocketfi_webhook_events").insert({
    payload,
    signature_valid: true,
    matched_payment_id: matched,
  });

  return NextResponse.json({ message: "success" });
}
