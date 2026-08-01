import "server-only";

// Thin wrapper around PocketFi's payment API (https://developer.pocketfi.ng)
// — used to let customers fund their NexaVerify wallet instantly via card,
// bank transfer, or mobile wallet, instead of only the manual admin-reviewed
// topup_requests flow (see app/api/wallet/topup-request/route.js).
//
// This file is server-only: it reads POCKETFI_SECRET_KEY from the
// environment and must never be imported from a Client Component.
//
// IMPORTANT gap in PocketFi's published docs (as of the version pasted into
// this project): the webhook payload (order + transaction.reference) does
// NOT include the payment_id that Initialize Payment gave us, so a webhook
// alone can't be reliably matched back to a specific pending payment row.
// The reliable path this integration relies on is: we generate redirect_link
// ourselves with our own payment_id embedded in the query string, so when
// PocketFi redirects the customer's browser back to us, we already know
// exactly which payment to confirm — see app/api/wallet/fund/callback and
// lib/wallet-funding.js. The webhook route is wired up too (best effort +
// audit log) but is NOT the primary crediting mechanism. Same lesson as the
// DaisySMS LTR episode: don't guess past what a vendor's docs actually
// guarantee.

const BASE_URL = process.env.POCKETFI_BASE_URL || "https://api.pocketfi.ng/api/v1";
const SECRET_KEY = process.env.POCKETFI_SECRET_KEY;
const BUSINESS_ID = process.env.POCKETFI_BUSINESS_ID;

export class PocketfiError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "PocketfiError";
    this.code = code;
  }
}

// Every request gets a hard timeout so a slow/unresponsive PocketFi endpoint
// fails loudly instead of hanging the calling route indefinitely — same
// reasoning as DAISYSMS's fetchWithTimeout in lib/daisy.js.
const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new PocketfiError("TIMEOUT", `PocketFi did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw new PocketfiError("NETWORK_ERROR", `Could not reach PocketFi: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function call(path, body) {
  if (!SECRET_KEY) {
    throw new PocketfiError("NO_API_KEY", "POCKETFI_SECRET_KEY is not set in the environment");
  }

  const res = await fetchWithTimeout(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new PocketfiError(
      "BAD_JSON",
      `Expected JSON from PocketFi, got: ${text.slice(0, 200)}`
    );
  }

  if (!res.ok || data?.status === false) {
    throw new PocketfiError(
      "REQUEST_FAILED",
      data?.message || `PocketFi returned HTTP ${res.status}`
    );
  }

  return data;
}

// Creates a hosted checkout session. Returns { paymentId, paymentLink }.
// amount is in Naira (NGN) — pass a plain number, e.g. 5000 for ₦5,000.
export async function initializePayment({
  firstName,
  lastName,
  phone,
  email,
  amount,
  redirectLink,
}) {
  if (!BUSINESS_ID) {
    throw new PocketfiError("NO_BUSINESS_ID", "POCKETFI_BUSINESS_ID is not set in the environment");
  }

  const data = await call("/checkout/request", {
    first_name: firstName,
    last_name: lastName,
    phone,
    business_id: BUSINESS_ID,
    email,
    redirect_link: redirectLink,
    amount: String(amount),
  });

  if (!data.payment_id || !data.payment_link) {
    throw new PocketfiError("UNKNOWN_RESPONSE", "PocketFi response is missing payment_id/payment_link");
  }

  return { paymentId: data.payment_id, paymentLink: data.payment_link };
}

// Server-side verification of a payment's actual status — always call this
// before crediting a wallet. Returns { status, amount, account, paymentId }.
// Docs show `status` as both "pending" and "Completed" in different sample
// responses, so callers should compare case-insensitively.
export async function confirmPayment(paymentId) {
  const data = await call("/checkout/confirm", { payment_id: paymentId });

  return {
    status: String(data.status || "").toLowerCase(),
    amount: data.amount != null ? Number(data.amount) : null,
    account: data.account ?? null,
    paymentId: data.payment_id ?? paymentId,
  };
}

export function isSuccessfulStatus(status) {
  return ["success", "successful", "completed", "paid"].includes(String(status || "").toLowerCase());
}

export function isFailedStatus(status) {
  return ["failed", "cancelled", "canceled", "declined", "reversed"].includes(
    String(status || "").toLowerCase()
  );
}
