import "server-only";

// Thin wrapper around the DaisySMS "handler_api.php" endpoint (sms-activate
// compatible), plus a couple of newer REST-style endpoints (/api/ltrs,
// /api/info) confirmed via daisysms.com/docs/api to live specifically on
// daisysms.com — NOT necessarily on whatever domain DAISYSMS_BASE_URL points
// handler_api.php at. Confirmed in live testing: the .io mirror serves
// handler_api.php fine, but returns an HTML page (not JSON) for /api/ltrs —
// it doesn't host the newer REST endpoints. So these two API surfaces are
// deliberately NOT derived from the same origin.
// This file is server-only: it reads DAISYSMS_API_KEY from the environment
// and must never be imported from a Client Component.
//
// Docs: https://daisysms.com/docs/api — has the full "Long-term rentals /
// LTR" section, which is where duration, renewable, auto_renew, keep,
// setAutoRenew and getLtrs come from.
//
// NOTE on LTR billing: DaisySMS charges an ongoing daily/monthly fee to keep
// a long-term number alive (auto-renewed from your master DaisySMS balance
// if auto_renew is on). The docs don't give a clean webhook/header for the
// exact amount + currency unit of each renewal charge, so this file does NOT
// attempt to auto-deduct that from a customer's NexaVerify wallet — see
// "TODO(LTR billing)" below and SUPABASE_SETUP.md for what to do instead.

const BASE_URL = process.env.DAISYSMS_BASE_URL || "https://daisysms.io/stubs/handler_api.php";
const API_KEY = process.env.DAISYSMS_API_KEY;
// getLtrs()/getAccountInfo() below always hit daisysms.com regardless of
// what domain handler_api.php calls (via BASE_URL) use — see note above.
const REST_API_ORIGIN = "https://daisysms.com";

export class DaisyError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "DaisyError";
    this.code = code;
  }
}

// Every request to DaisySMS gets a hard cap. Without this, a slow or
// unresponsive DaisySMS endpoint would hang the calling route (an admin
// button click, a cron job, a customer's purchase) indefinitely instead of
// failing with a clear error — which is exactly what made an early live-test
// cron job look like a networking mystery before this existed.
const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new DaisyError("TIMEOUT", `DaisySMS did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw new DaisyError("NETWORK_ERROR", `Could not reach DaisySMS: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function call(action, params = {}) {
  if (!API_KEY) {
    throw new DaisyError("NO_API_KEY", "DAISYSMS_API_KEY is not set in the environment");
  }

  const url = new URL(BASE_URL);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetchWithTimeout(url.toString(), { method: "GET", cache: "no-store" });
  const text = (await res.text()).trim();
  const price = res.headers.get("x-price");
  const fullText = res.headers.get("x-text");

  return { text, price, fullText, status: res.status };
}

// ACCESS_BALANCE:50.30  /  BAD_KEY
export async function getBalance() {
  const { text } = await call("getBalance");
  if (text === "BAD_KEY") throw new DaisyError("BAD_KEY", "DaisySMS API key rejected");
  const [, amount] = text.split(":");
  return Number(amount);
}

// ACCESS_NUMBER:id:number / MAX_PRICE_EXCEEDED / NO_NUMBERS / TOO_MANY_ACTIVE_RENTALS / NO_MONEY
//
// duration: omit for a normal short-term rental (5-15 min). For a long-term
// rental, pass a string like "1D" (1 day), "12H" (12 hours), "3M" (3 months).
// H = hours, D = days, M = months. Max rental period is 1 year; anything
// under a day is billed as a full day.
// renewable: 0 or 1 (default is renewable). Pass 0 to make the LTR a fixed
// term that can't be extended.
// autoRenew: pass true to have DaisySMS try to auto-charge your master
// balance to keep the number alive when it's about to expire.
export async function getNumber({
  service,
  maxPrice,
  areas,
  carriers,
  number,
  duration,
  renewable,
  autoRenew,
  extra = {},
}) {
  const params = {
    service,
    max_price: maxPrice,
    areas,
    carriers,
    number,
    duration,
    renewable: renewable === undefined ? undefined : renewable ? 1 : 0,
    auto_renew: autoRenew ? 1 : undefined,
    ...extra,
  };

  const { text, price } = await call("getNumber", params);

  if (text === "MAX_PRICE_EXCEEDED") throw new DaisyError("MAX_PRICE_EXCEEDED", "Price exceeds max_price");
  if (text === "NO_NUMBERS") throw new DaisyError("NO_NUMBERS", "No numbers left for this service");
  if (text === "TOO_MANY_ACTIVE_RENTALS") throw new DaisyError("TOO_MANY_ACTIVE_RENTALS", "20 active rental limit reached");
  if (text === "NO_MONEY") throw new DaisyError("NO_MONEY", "Not enough DaisySMS balance");

  const [, id, phoneNumber] = text.split(":");
  if (!id || !phoneNumber) throw new DaisyError("UNKNOWN_RESPONSE", `Unexpected response: ${text}`);

  return {
    daisyId: id,
    phoneNumber,
    price: price ? Number(price) : null,
  };
}

// STATUS_OK:code / NO_ACTIVATION / STATUS_WAIT_CODE / STATUS_CANCEL
export async function getStatus(daisyId, { wantFullText = false } = {}) {
  const { text, fullText } = await call("getStatus", {
    id: daisyId,
    text: wantFullText ? 1 : undefined,
  });

  if (text === "NO_ACTIVATION") throw new DaisyError("NO_ACTIVATION", "Unknown rental id");
  if (text === "STATUS_WAIT_CODE") return { status: "waiting" };
  if (text === "STATUS_CANCEL") return { status: "cancelled" };

  if (text.startsWith("STATUS_OK")) {
    const [, code] = text.split(":");
    return { status: "received", code, fullText: fullText || null };
  }

  throw new DaisyError("UNKNOWN_RESPONSE", `Unexpected response: ${text}`);
}

// status=6 -> mark done. ACCESS_ACTIVATION / NO_ACTIVATION
export async function markDone(daisyId) {
  const { text } = await call("setStatus", { id: daisyId, status: 6 });
  if (text === "NO_ACTIVATION") throw new DaisyError("NO_ACTIVATION", "Rental missing");
  if (text !== "ACCESS_ACTIVATION") throw new DaisyError("UNKNOWN_RESPONSE", `Unexpected response: ${text}`);
  return true;
}

// status=8 -> cancel. ACCESS_CANCEL / ACCESS_READY (already got code, can't cancel)
export async function cancelRental(daisyId) {
  const { text } = await call("setStatus", { id: daisyId, status: 8 });
  if (text === "ACCESS_READY") throw new DaisyError("ACCESS_READY", "Rental already has a code, cannot cancel");
  if (text !== "ACCESS_CANCEL") throw new DaisyError("UNKNOWN_RESPONSE", `Unexpected response: ${text}`);
  return true;
}

// ASLEEP:id:number:timestamp (must wait) / ACCESS_NUMBER:id:number (ready) / BAD_ID
export async function getExtraActivation(previousActivationId) {
  const { text, price } = await call("getExtraActivation", { activationId: previousActivationId });

  if (text === "BAD_ID") throw new DaisyError("BAD_ID", "Rental missing or already has a pending code");

  if (text.startsWith("ASLEEP")) {
    const [, id, phoneNumber, readyAt] = text.split(":");
    return { ready: false, daisyId: id, phoneNumber, readyAt: Number(readyAt) };
  }

  if (text.startsWith("ACCESS_NUMBER")) {
    const [, id, phoneNumber] = text.split(":");
    return { ready: true, daisyId: id, phoneNumber, price: price ? Number(price) : null };
  }

  throw new DaisyError("UNKNOWN_RESPONSE", `Unexpected response: ${text}`);
}

// Pretends a message was received on a long-term number so the LTR activates
// (useful when supply is tight and a real message won't arrive in time).
// You are billed as if a real message came in. OK / BAD_ID
export async function keepRental(daisyId) {
  const { text } = await call("keep", { id: daisyId });
  if (text === "BAD_ID") throw new DaisyError("BAD_ID", "Rental missing or not eligible");
  if (text !== "OK") throw new DaisyError("UNKNOWN_RESPONSE", `Unexpected response: ${text}`);
  return true;
}

// Toggle whether a long-term rental auto-renews (charges your master balance
// automatically) when it's about to expire. OK / BAD_ID
export async function setAutoRenew(daisyId, value) {
  const { text } = await call("setAutoRenew", { id: daisyId, value: value ? "true" : "false" });
  if (text === "BAD_ID") throw new DaisyError("BAD_ID", "Rental missing or not a long-term rental");
  if (text !== "OK") throw new DaisyError("UNKNOWN_RESPONSE", `Unexpected response: ${text}`);
  return true;
}

// GET /api/ltrs — NOT under handler_api.php. Returns the authoritative list
// of your account's long-term rentals: id, service, status, created_at,
// paid_until, auto_renew, daily_price, renewable, period_duration,
// period_type, phone, cancellable, recoverable. This is the source of truth
// for expiry/renewal — poll it (via the admin "Sync LTRs" button) rather
// than trying to compute expiry yourself.
export async function getLtrs() {
  if (!API_KEY) throw new DaisyError("NO_API_KEY", "DAISYSMS_API_KEY is not set in the environment");
  const url = new URL(`${REST_API_ORIGIN}/api/ltrs`);
  url.searchParams.set("api_key", API_KEY);
  const res = await fetchWithTimeout(url.toString(), { method: "GET", cache: "no-store" });
  const text = await res.text();
  return safeJson(text);
}

// GET /api/info — e.g. { "rentals_concurrent_limit": 10 }
export async function getAccountInfo() {
  if (!API_KEY) throw new DaisyError("NO_API_KEY", "DAISYSMS_API_KEY is not set in the environment");
  const url = new URL(`${REST_API_ORIGIN}/api/info`);
  url.searchParams.set("api_key", API_KEY);
  const res = await fetchWithTimeout(url.toString(), { method: "GET", cache: "no-store" });
  const text = await res.text();
  return safeJson(text);
}

// Object keyed service => country => { cost, count, ... }
export async function getPricesVerification() {
  const { text } = await call("getPricesVerification");
  return safeJson(text);
}

// Object keyed country => service => { cost, count, ... }
export async function getPrices() {
  const { text } = await call("getPrices");
  return safeJson(text);
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new DaisyError("BAD_JSON", `Expected JSON, got: ${text.slice(0, 200)}`);
  }
}
