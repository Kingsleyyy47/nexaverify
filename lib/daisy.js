import "server-only";

// Thin wrapper around the DaisySMS "handler_api.php" endpoint (sms-activate
// compatible). Confirmed in live testing: .io and .com are separate account
// systems, not interchangeable mirrors — an API key only works against the
// domain the account actually lives on. Keep DAISYSMS_BASE_URL configurable
// instead of hardcoding either domain here again.
// This file is server-only: it reads DAISYSMS_API_KEY from the environment
// and must never be imported from a Client Component.
//
// The published .io API for this account documents the sms-activate actions
// used below: getBalance, getNumber, getStatus, setStatus, getExtraActivation,
// getPricesVerification/getPrices, and webhooks. Long-term rentals can still
// pass duration= through getNumber, but the parked helpers for bulk LTR sync
// and auto-renew use endpoints/actions that are not documented for this .io
// account and should stay out of the customer-facing flow until re-verified.
//
// NOTE on LTR billing: DaisySMS charges an ongoing daily/monthly fee to keep
// a long-term number alive (auto-renewed from your master DaisySMS balance
// if auto_renew is on). The docs don't give a clean webhook/header for the
// exact amount + currency unit of each renewal charge, so this file does NOT
// attempt to auto-deduct that from a customer's NexaVerify wallet — see
// "TODO(LTR billing)" below and SUPABASE_SETUP.md for what to do instead.

const BASE_URL = process.env.DAISYSMS_BASE_URL || "https://daisysms.io/stubs/handler_api.php";
const API_KEY = process.env.DAISYSMS_API_KEY;
// Parked/non-customer-facing LTR helpers below derive their origin from the
// same configured base URL so any future re-verification hits the right
// account domain.
const REST_API_ORIGIN = new URL(BASE_URL).origin;

export class DaisyError extends Error {
  constructor(code, message, raw) {
    super(message || code);
    this.name = "DaisyError";
    this.code = code;
    // The real raw response text, when there was one — needed for admin
    // diagnosis (see lib/errorLog.js) but never something `.message` itself
    // should carry, since some call sites' generic fallback messages do get
    // shown to customers.
    this.raw = raw;
  }
}

// DaisySMS numbers/ids are always plain digit strings. Validating this
// before trusting a colon-split field closes off the exact bug class that
// let a Cloudflare/WAF block page (returned as plain text instead of
// DaisySMS's real handler_api.php protocol) get silently accepted as a
// legitimate ACCESS_NUMBER response and stored as a customer's phone number
// (see the Sept 2026 incident: a CSP header fragment ended up displayed on
// the dashboard as a phone number, because the old code only checked for a
// handful of known FAILURE strings and otherwise trusted split(":") output
// completely, with no shape check on what came back).
const DIGITS_RE = /^\d+$/;
const PHONE_RE = /^\d{6,15}$/;

// Every request to DaisySMS gets a hard cap. Without this, a slow or
// unresponsive DaisySMS endpoint would hang the calling route (an admin
// button click, a cron job, a customer's purchase) indefinitely instead of
// failing with a clear error — which is exactly what made an early live-test
// cron job look like a networking mystery before this existed.
//
// Sept 2026: bumped from 15s to 25s after a "Could not rent a number right
// now" report where DaisySMS's own dashboard showed the number had actually
// been rented and charged — i.e. the request succeeded on DaisySMS's side,
// but our side gave up waiting before the response arrived. A getNumber call
// during a demand surge (DaisySMS's own docs mention prices/availability
// shifting under surge conditions) is exactly the kind of request that could
// plausibly take longer than 15s to come back even though it still
// succeeds, so this trades a little extra worst-case wait time for fewer
// false timeouts on an action that already charges real money when it goes
// through.
const REQUEST_TIMEOUT_MS = 25_000;

// DaisySMS sits behind Cloudflare, which blocks many hosting-provider IP
// ranges (Vercel's shared serverless IPs included) no matter what headers are
// sent. A spoofed browser User-Agent does not help: a request that claims to
// be Chrome but has no cookies, no JS and a datacenter IP with a non-browser
// TLS fingerprint is a stronger bot signal than an honest request. So this
// file sends plain, honest requests with no custom headers.
//
// If Vercel's egress range is blocked, set DAISYSMS_PROXY_URL (and
// DAISYSMS_PROXY_SECRET) to route handler_api.php calls through the Supabase
// Edge Function in supabase/functions/daisysms-proxy, so the outbound request
// to DaisySMS originates from Supabase's network instead. The proxy forwards
// the query string unchanged and returns the response as is. When the env var
// is unset, calls go directly to DAISYSMS_BASE_URL exactly as before.
const PROXY_URL = process.env.DAISYSMS_PROXY_URL;
const PROXY_SECRET = process.env.DAISYSMS_PROXY_SECRET;

// Actions that only read state, so repeating one after a transient network
// error can never double-charge or double-rent. getNumber, setStatus, keep and
// setAutoRenew are deliberately NOT retried: a network error there may mean
// the request reached DaisySMS and succeeded, and a retry could rent (and
// bill) a second number.
const RETRYABLE_ACTIONS = new Set(["getBalance", "getStatus", "getPrices", "getPricesVerification"]);

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
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

  // Same query string either way; only the origin and an auth header change
  // when the Supabase proxy is configured.
  let target = url.toString();
  const headers = {};
  if (PROXY_URL) {
    const proxied = new URL(PROXY_URL);
    proxied.search = url.search;
    target = proxied.toString();
    if (PROXY_SECRET) headers["x-proxy-secret"] = PROXY_SECRET;
  }

  const maxAttempts = RETRYABLE_ACTIONS.has(action) ? 2 : 1;
  let res;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetchWithTimeout(target, { method: "GET", cache: "no-store", headers });
      break;
    } catch (err) {
      // Retry only transient connection failures, never timeouts, and only
      // for read-only actions.
      if (err.code === "NETWORK_ERROR" && attempt < maxAttempts) continue;
      throw err;
    }
  }
  const text = (await res.text()).trim();
  const price = res.headers.get("x-price");
  const fullText = res.headers.get("x-text");

  // A Cloudflare/WAF challenge, a proxy error page, or any other
  // intermediary failure comes back as HTML/markup instead of DaisySMS's
  // plain-text protocol. Reject it here, once, for every action, rather
  // than letting each caller's colon-split logic try to make sense of it.
  // Log a clear line too, so a future IP block shows up as an obvious cause
  // instead of a confusing parse failure downstream.
  if (/^<|<html/i.test(text)) {
    console.error(
      `[daisy] ${action}: got HTML instead of an API response (HTTP ${res.status}) via ${
        PROXY_URL ? "proxy" : "direct"
      } call. Likely a Cloudflare block on this egress IP range.`
    );
    throw new DaisyError("BAD_RESPONSE", "DaisySMS returned a non-API response", text.slice(0, 500));
  }

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
  if (text === "BAD_KEY") throw new DaisyError("BAD_KEY", "DaisySMS API key rejected");
  if (text === "BAD_ACTION") throw new DaisyError("BAD_ACTION", "DaisySMS rejected the getNumber action");
  if (text === "BAD_SERVICE") throw new DaisyError("BAD_SERVICE", `DaisySMS doesn't recognize service "${service}"`);

  // Only ever trust a colon-split id/number pair when the response actually
  // starts with the documented success token AND both fields look like real
  // digit strings — see the DIGITS_RE/PHONE_RE comment above for why.
  if (!text.startsWith("ACCESS_NUMBER:")) {
    throw new DaisyError("UNKNOWN_RESPONSE", "DaisySMS returned an unrecognized response", text.slice(0, 500));
  }
  const [, id, phoneNumber] = text.split(":");
  if (!DIGITS_RE.test(id || "") || !PHONE_RE.test(phoneNumber || "")) {
    throw new DaisyError("UNKNOWN_RESPONSE", "DaisySMS returned an unrecognized response", text.slice(0, 500));
  }

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

  throw new DaisyError("UNKNOWN_RESPONSE", "DaisySMS returned an unrecognized response", text.slice(0, 500));
}

// status=6 -> mark done. ACCESS_ACTIVATION / NO_ACTIVATION
export async function markDone(daisyId) {
  const { text } = await call("setStatus", { id: daisyId, status: 6 });
  if (text === "NO_ACTIVATION") throw new DaisyError("NO_ACTIVATION", "Rental missing");
  if (text !== "ACCESS_ACTIVATION") throw new DaisyError("UNKNOWN_RESPONSE", "DaisySMS returned an unrecognized response", text.slice(0, 500));
  return true;
}

// status=8 -> cancel. ACCESS_CANCEL / ACCESS_READY (already got code, can't cancel) / NO_ACTIVATION
export async function cancelRental(daisyId) {
  const { text } = await call("setStatus", { id: daisyId, status: 8 });
  if (text === "ACCESS_READY") throw new DaisyError("ACCESS_READY", "Rental already has a code, cannot cancel");
  // Distinguished from the generic UNKNOWN_RESPONSE fallback so callers (e.g.
  // the timeout sweep) can treat "nothing left to cancel" as equivalent to a
  // successful cancel, instead of retrying forever against an ID that's
  // permanently gone.
  if (text === "NO_ACTIVATION") throw new DaisyError("NO_ACTIVATION", "Rental missing or already resolved");
  if (text !== "ACCESS_CANCEL") throw new DaisyError("UNKNOWN_RESPONSE", "DaisySMS returned an unrecognized response", text.slice(0, 500));
  return true;
}

// ASLEEP:id:number:timestamp (must wait) / ACCESS_NUMBER:id:number (ready) / BAD_ID
export async function getExtraActivation(previousActivationId) {
  const { text, price } = await call("getExtraActivation", { activationId: previousActivationId });

  if (text === "BAD_ID") throw new DaisyError("BAD_ID", "Rental missing or already has a pending code");

  if (text.startsWith("ASLEEP:")) {
    const [, id, phoneNumber, readyAt] = text.split(":");
    if (!DIGITS_RE.test(id || "") || !PHONE_RE.test(phoneNumber || "")) {
      throw new DaisyError("UNKNOWN_RESPONSE", "DaisySMS returned an unrecognized response", text.slice(0, 500));
    }
    return { ready: false, daisyId: id, phoneNumber, readyAt: Number(readyAt) };
  }

  if (text.startsWith("ACCESS_NUMBER:")) {
    const [, id, phoneNumber] = text.split(":");
    if (!DIGITS_RE.test(id || "") || !PHONE_RE.test(phoneNumber || "")) {
      throw new DaisyError("UNKNOWN_RESPONSE", "DaisySMS returned an unrecognized response", text.slice(0, 500));
    }
    return { ready: true, daisyId: id, phoneNumber, price: price ? Number(price) : null };
  }

  throw new DaisyError("UNKNOWN_RESPONSE", "DaisySMS returned an unrecognized response", text.slice(0, 500));
}

// Pretends a message was received on a long-term number so the LTR activates
// (useful when supply is tight and a real message won't arrive in time).
// You are billed as if a real message came in. OK / BAD_ID
export async function keepRental(daisyId) {
  const { text } = await call("keep", { id: daisyId });
  if (text === "BAD_ID") throw new DaisyError("BAD_ID", "Rental missing or not eligible");
  if (text !== "OK") throw new DaisyError("UNKNOWN_RESPONSE", "DaisySMS returned an unrecognized response", text.slice(0, 500));
  return true;
}

// Toggle whether a long-term rental auto-renews (charges your master balance
// automatically) when it's about to expire. OK / BAD_ID
export async function setAutoRenew(daisyId, value) {
  const { text } = await call("setAutoRenew", { id: daisyId, value: value ? "true" : "false" });
  if (text === "BAD_ID") throw new DaisyError("BAD_ID", "Rental missing or not a long-term rental");
  if (text !== "OK") throw new DaisyError("UNKNOWN_RESPONSE", "DaisySMS returned an unrecognized response", text.slice(0, 500));
  return true;
}

// PARKED/UNVERIFIED: GET /api/ltrs is not part of the .io sms-activate
// handler_api.php docs for this account. The admin LTR sync route is paused;
// keep this helper only as reference if DaisySMS later confirms a working
// list/expiry endpoint for the account.
export async function getLtrs() {
  if (!API_KEY) throw new DaisyError("NO_API_KEY", "DAISYSMS_API_KEY is not set in the environment");
  const url = new URL(`${REST_API_ORIGIN}/api/ltrs`);
  url.searchParams.set("api_key", API_KEY);
  const res = await fetchWithTimeout(url.toString(), { method: "GET", cache: "no-store" });
  const text = await res.text();
  return safeJson(text);
}

// PARKED/UNVERIFIED: not documented in the current .io handler_api.php spec.
// Example shape from older testing: { "rentals_concurrent_limit": 10 }.
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
    throw new DaisyError("BAD_JSON", "Expected JSON from DaisySMS", text.slice(0, 500));
  }
}
