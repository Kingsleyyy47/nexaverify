import "server-only";

// Thin wrapper around DaisySim's Virtual Numbers REST API
// (https://daisysim.com/api/v1/virtual) — a second phone-number provider
// alongside DaisySMS (see lib/daisy.js). Unlike DaisySMS's flat, admin-priced
// service catalog, DaisySim is country + service scoped with LIVE price
// tiers that expire after 5 minutes — there's no local catalog to sync and
// pre-price the way public.services works for DaisySMS. Instead, NexaVerify
// fetches countries/services/prices live and applies one global flat-NGN
// markup (see public.daisysim_config) at purchase time. See
// app/api/international/* for how this gets wired into a buy flow.
//
// This file is server-only: it reads DAISYSIM_API_KEY from the environment
// and must never be imported from a Client Component.

const BASE_URL = process.env.DAISYSIM_BASE_URL || "https://daisysim.com/api/v1/virtual";
const API_KEY = process.env.DAISYSIM_API_KEY;

export class DaisySimError extends Error {
  constructor(code, message, raw) {
    super(message || code);
    this.name = "DaisySimError";
    this.code = code;
    // Full parsed response body, when there was one — needed for CODE_RECEIVED
    // on /cancel, which their docs say includes the code in the response body
    // even though the request is technically rejected. Shape isn't nailed
    // down by an example in the docs, so callers should check defensively
    // (e.g. raw?.data?.code) rather than assume one exact path.
    this.raw = raw;
  }
}

// Every request gets a hard timeout — same reasoning as lib/daisy.js and
// lib/pocketfi.js: a slow/unresponsive provider should fail loudly instead
// of hanging the calling route indefinitely.
const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new DaisySimError("TIMEOUT", `DaisySim did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw new DaisySimError("NETWORK_ERROR", `Could not reach DaisySim: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function call(method, path, body) {
  if (!API_KEY) {
    throw new DaisySimError("NO_API_KEY", "DAISYSIM_API_KEY is not set in the environment");
  }

  const res = await fetchWithTimeout(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new DaisySimError("BAD_JSON", `Expected JSON from DaisySim, got: ${text.slice(0, 200)}`);
  }

  if (!data.success) {
    // Machine-readable error envelope: { success: false, error, code }.
    // Falls back to a generic code if DaisySim ever omits it. The full body
    // is attached to the error (see DaisySimError.raw) since at least one
    // documented error case (CODE_RECEIVED on /cancel) carries useful data
    // alongside the rejection.
    throw new DaisySimError(data.code || "REQUEST_FAILED", data.error || `DaisySim returned HTTP ${res.status}`, data);
  }

  return data.data;
}

// { balance, currency, email }
export async function getBalance() {
  return call("GET", "/balance");
}

// [{ id, name }, ...] — sorted alphabetically by DaisySim
export async function getCountries() {
  const data = await call("GET", "/countries");
  return data.countries || [];
}

// [{ code, name }, ...] for the given country id
export async function getServicesForCountry(countryId) {
  const data = await call("GET", `/services/${encodeURIComponent(countryId)}`);
  return data.services || [];
}

// { country, service, total_numbers, tiers: [{ tier, price, available }] }
// Rate limited to 30/min by DaisySim. Tiers expire after 5 minutes — always
// re-fetch right before a purchase rather than reusing a cached price.
export async function getPrices({ country, service }) {
  return call("POST", "/prices", { country, service });
}

// Pass `price` through EXACTLY as returned by getPrices — DaisySim validates
// it against live pricing and rejects anything modified/stale as
// INVALID_PRICE. Rate limited to 10/min.
export async function purchaseNumber({ country, service, price, serviceName }) {
  const data = await call("POST", "/purchase", {
    country,
    service,
    price,
    ...(serviceName ? { service_name: serviceName } : {}),
  });
  return {
    activationId: data.activation_id,
    phoneNumber: data.phone_number,
    service: data.service,
    country: data.country,
    amountCharged: data.amount_charged,
    balanceAfter: data.balance_after,
  };
}

// { activationId, status: "waiting"|"received"|"cancelled", code, phoneNumber }
// status is normalized to match NexaVerify's own rentals.status vocabulary
// (DaisySim's own casing is "Waiting"/"Completed"/"Cancelled"). Rate limited
// to 60/min — poll every 3-5s per DaisySim's own guidance.
export async function checkSms(activationId) {
  const data = await call("GET", `/check/${encodeURIComponent(activationId)}`);
  const statusMap = { waiting: "waiting", completed: "received", cancelled: "cancelled" };
  return {
    activationId: data.activation_id,
    status: statusMap[String(data.status || "").toLowerCase()] || "waiting",
    code: data.code,
    phoneNumber: data.phone_number,
  };
}

// Only allowed 120s+ after purchase, and not once a code has already been
// received — DaisySim returns TOO_EARLY / CODE_RECEIVED for those cases
// respectively (the latter includes the code in the response body so the
// caller isn't left empty-handed). Rate limited to 10/min.
export async function cancelActivation(activationId) {
  const data = await call("POST", `/cancel/${encodeURIComponent(activationId)}`);
  return { activationId: data.activation_id, refund: data.refund, balanceAfter: data.balance_after };
}

// Shared by /api/international/prices (display) and /api/international/buy
// (the actual charge) so the two can never drift apart — both call this the
// same way, right before showing/charging, using the live usdRate and the
// admin's current markup_amount_ngn (see public.daisysim_config).
export function computeNgnPrice(usdPrice, usdRate, markupNgn) {
  const ngn = Number(usdPrice || 0) * Number(usdRate || 0) + Number(markupNgn || 0);
  return Math.max(0, Math.round(ngn * 100) / 100);
}

// Not used anywhere yet — NexaVerify's own rentals table is the source of
// truth for a customer's order history, so this is here only in case admin
// reconciliation against DaisySim's own records is ever needed.
export async function getHistory({ page = 1, perPage = 20, status } = {}) {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (status) params.set("status", status);
  const data = await call("GET", `/history?${params.toString()}`);
  return data;
}
