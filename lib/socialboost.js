import "server-only";

// Thin wrapper around the "Social Boost" SMM panel API (v2) at
// thelordofthepanels.com — a generic social-media-marketing panel (follower/
// like/view/comment packages, priced per 1000 units, "service" catalog
// fetched live). Genuinely different shape from every other provider in this
// app: there's no phone number or username recipient hash — every action is
// keyed off a numeric `service` id and a `link` (URL to boost), and pricing
// is entirely provider-set (a `rate` per 1000 units per service) rather than
// admin-configured like iStar's stars/premium markups.
//
// Single flat endpoint style (unlike DaisySMS/DaisySim's REST-ish paths):
// every action is a POST to the same URL with an `action` field distinguishing
// what's being asked for. This file is server-only: it reads
// SOCIAL_BOOST_API_KEY from the environment and must never be imported from a
// Client Component.

const BASE_URL = process.env.SOCIAL_BOOST_API_URL || "https://thelordofthepanels.com/api/v2";
const API_KEY = process.env.SOCIAL_BOOST_API_KEY;

export class SocialBoostError extends Error {
  constructor(code, message, status) {
    super(message || code);
    this.name = "SocialBoostError";
    this.code = code;
    this.status = status;
  }
}

// Every request gets a hard timeout — same reasoning as every other
// lib/*.js provider wrapper in this project.
const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new SocialBoostError("TIMEOUT", "The social boost provider didn't respond in time — please try again.");
    }
    throw new SocialBoostError("NETWORK_ERROR", "Could not reach the social boost provider — please try again.");
  } finally {
    clearTimeout(timeout);
  }
}

// All actions are a single POST with `key` + `action` + whatever else the
// action needs, application/x-www-form-urlencoded (matches the panel's own
// PHP example — some SMM panels reject JSON bodies even though they return
// JSON responses).
async function call(action, params = {}) {
  if (!API_KEY) {
    throw new SocialBoostError("NO_API_KEY", "Social Boost isn't configured yet — contact support.");
  }

  const body = new URLSearchParams({ key: API_KEY, action, ...params });

  const res = await fetchWithTimeout(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    console.error(`[lib/socialboost] non-JSON response for action=${action}:`, text.slice(0, 200));
    throw new SocialBoostError("BAD_JSON", "The social boost provider sent back an unexpected response.", res.status);
  }

  if (!res.ok) {
    console.error(`[lib/socialboost] action=${action} -> HTTP ${res.status}:`, JSON.stringify(data).slice(0, 500));
    throw new SocialBoostError(`HTTP_${res.status}`, data?.error || `The provider returned an error (HTTP ${res.status}).`, res.status);
  }

  // The panel puts errors in a 200-OK body too (e.g. { error: "Incorrect
  // order ID" }) rather than always using HTTP status codes — surface those
  // the same way as a non-OK response so callers only need one error path.
  if (data && typeof data === "object" && !Array.isArray(data) && data.error) {
    throw new SocialBoostError("PROVIDER_ERROR", data.error, res.status);
  }

  return data;
}

// [{ service, name, type, category, rate, min, max, refill, cancel }, ...]
// `rate` is price per 1000 units, in the panel's own currency (USD).
export async function getServices() {
  return call("services");
}

// { balance, currency }
export async function getBalance() {
  return call("balance");
}

// { order: <id> }
export async function placeOrder({ service, link, quantity, runs, interval }) {
  const params = { service, link, quantity };
  if (runs !== undefined && runs !== null && runs !== "") params.runs = runs;
  if (interval !== undefined && interval !== null && interval !== "") params.interval = interval;
  return call("add", params);
}

// { charge, start_count, status, remains, currency }
export async function getOrderStatus(orderId) {
  return call("status", { order: orderId });
}

// { "<id>": { charge, start_count, status, remains, currency } | { error }, ... }
export async function getMultipleOrderStatus(orderIds) {
  return call("status", { orders: orderIds.join(",") });
}

// { refill: "<id>" }
export async function createRefill(orderId) {
  return call("refill", { order: orderId });
}

// { status: "Completed" | "Rejected" | ... }
export async function getRefillStatus(refillId) {
  return call("refill_status", { refill: refillId });
}

// [{ order, cancel: 1 | { error } }, ...]
export async function cancelOrders(orderIds) {
  return call("cancel", { orders: orderIds.join(",") });
}
