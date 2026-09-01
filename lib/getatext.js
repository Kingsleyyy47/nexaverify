import "server-only";

// Thin wrapper around Getatext (https://getatext.com/api/v1) — the provider
// now backing the "US Only" product slot, replacing DaisySim's server7 API
// (the old lib/daisysimUsa.js). US-only, flat service catalog, same as the
// provider it replaces — no country picker needed on the customer side.
//
// A few real differences from DaisySim's server7 API that shaped this file:
//   - Auth is a plain `Auth: YOUR_API_KEY` header — not `Authorization:
//     Bearer`, and not the same casing/scheme as any other provider in this
//     app. Easy to get wrong if you copy-paste from another lib/*.js file.
//   - There's no single machine-readable error code field — every failure is
//     just `{ errors: "<human-readable message>" }` (sometimes literally the
//     STRING "null" on a couple of success responses, not real null, e.g.
//     the mark-completed endpoint — see hasError() below). Getatext's own
//     error text is already customer-safe (no provider name, no internal
//     jargon), so callers can generally show `err.message` straight through
//     instead of mapping codes to friendlier text the way lib/daisysim.js
//     and lib/daisysimUsa.js used to.
//   - Cancelling a rental has no documented "already has a code" or "too
//     early to cancel" distinct error case (unlike DaisySim, which returned
//     CODE_RECEIVED/TOO_EARLY explicitly) — Getatext's docs only document a
//     generic 5-minute wait before non-instant-cancel accounts can cancel,
//     with no example error string for it. Callers should treat any cancel
//     failure as a generic "try again shortly" rather than parsing it for a
//     specific code.
//   - No `refund` boolean on cancel the way DaisySim's did — a successful
//     (non-throwing) cancel-rental call is treated as full refund
//     confirmation on its own, same convention already used for DaisySMS
//     elsewhere in this app.
//
// This file is server-only: it reads GETATEXT_API_KEY from the environment
// and must never be imported from a Client Component.

const BASE_URL = process.env.GETATEXT_BASE_URL || "https://getatext.com/api/v1";
const API_KEY = process.env.GETATEXT_API_KEY;

export class GetatextError extends Error {
  constructor(code, message, raw) {
    super(message || code);
    this.name = "GetatextError";
    this.code = code;
    this.raw = raw;
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new GetatextError("TIMEOUT", `Getatext did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw new GetatextError("NETWORK_ERROR", `Could not reach Getatext: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

// Getatext marks failure with an `errors` field — but at least one success
// response (mark-completed) has been seen returning the literal STRING
// "null" there instead of real null, so both are treated as "no error".
function hasError(data) {
  return data && data.errors != null && data.errors !== "null" && data.errors !== "";
}

// No documented error codes — this derives a rough one from the message text
// purely so a couple of call sites (status polling's "not found" fallback)
// can special-case it without hardcoding string matches at every call site.
function guessErrorCode(message, status) {
  const m = String(message || "").toLowerCase();
  if (m.includes("not found") || m.includes("does not exist")) return "NOT_FOUND";
  if (m.includes("insufficient") || m.includes("balance")) return "NO_BALANCE";
  if (m.includes("out of stock")) return "OUT_OF_STOCK";
  if (m.includes("maintenance")) return "MAINTENANCE";
  if (m.includes("maximum number of active rentals")) return "RENTAL_LIMIT";
  return status ? `HTTP_${status}` : "REQUEST_FAILED";
}

async function call(method, path, body) {
  if (!API_KEY) {
    throw new GetatextError("NO_API_KEY", "GETATEXT_API_KEY is not set in the environment");
  }

  const res = await fetchWithTimeout(`${BASE_URL}${path}`, {
    method,
    headers: {
      Auth: API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new GetatextError("BAD_JSON", `Expected JSON from Getatext, got: ${text.slice(0, 200)}`);
  }

  if (hasError(data)) {
    throw new GetatextError(guessErrorCode(data.errors, res.status), data.errors, data);
  }
  if (!res.ok) {
    // Belt and suspenders — every documented error case does set `errors`,
    // but a non-2xx with no `errors` field would otherwise slip through.
    throw new GetatextError(`HTTP_${res.status}`, `Getatext returned HTTP ${res.status}`, data);
  }

  return data;
}

// { balance, currency: "USD" }
export async function getBalance() {
  const data = await call("GET", "/balance");
  return { balance: Number(data.balance || 0), currency: "USD" };
}

// [{ code, name, price }, ...] — `countryId` is accepted only for interface
// compatibility with the provider this replaces (lib/daisysimUsa.js's
// getApps signature); Getatext is US-only with no country concept at all, so
// the argument is ignored. GET /prices-info's documented example shows a
// single service object rather than an array — defensively handled either
// way since the real response for a whole catalog is presumably an array of
// that same shape.
export async function getApps() {
  const data = await call("GET", "/prices-info");

  // Getatext's own docs show only a single bare service object as "the"
  // response for this endpoint, with no wrapper — but that's almost
  // certainly just documentation shorthand for what a real multi-service
  // catalog actually returns (an array of these). Defensively unwrap a few
  // plausible shapes (a raw array; an array under `data`/`services`/`prices`;
  // or, worst case, literally the single documented object) rather than
  // assuming just one, since getting this wrong silently returns an empty
  // catalog instead of a helpful error.
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.services)
        ? data.services
        : Array.isArray(data?.prices)
          ? data.prices
          : [data];

  const apps = list
    .filter((item) => item && item.api_name)
    .map((item) => ({
      code: item.api_name,
      name: item.service_name,
      price: Number(item.price || 0),
      stock: item.stock != null ? Number(item.stock) : null,
    }));

  // Diagnostic only — visible in Vercel's function logs, never shown to any
  // user. If this fires, the account's own catalog is genuinely empty (or
  // still an unrecognized response shape) rather than a bug in the request
  // itself, since `call()` already would have thrown on a non-2xx or an
  // `errors` field.
  if (apps.length === 0) {
    console.error("[getatext] getApps() parsed 0 services from a successful response:", JSON.stringify(data).slice(0, 500));
  }

  return apps;
}

// `app` must be a service code (api_name) copied verbatim from getApps() —
// Getatext resolves the live price server-side from the code alone, same as
// the provider this replaces. `country`/`countryName` are accepted only for
// interface compatibility (Getatext sells US numbers exclusively) and
// ignored. Rate limited to 2 req/sec.
export async function purchaseNumber({ app, appName }) {
  const data = await call("POST", "/rent-a-number", { service: app });
  return {
    activationId: data.id,
    phoneNumber: data.number,
    service: data.service_name || appName,
    country: "usa",
    amountCharged: Number(data.price || 0),
    balanceAfter: Number(data.new_balance || 0),
  };
}

// { activationId, status: "waiting"|"received"|"cancelled", code, phoneNumber }
// normalized to match NexaVerify's own rentals.status vocabulary. Getatext's
// rental-status doesn't document a distinct "code received" status string —
// a present, non-empty `code` is what actually signals a received SMS here.
export async function checkSms(activationId) {
  const data = await call("POST", "/rental-status", { id: activationId });
  const hasCode = data.code != null && String(data.code).length > 0;
  const status = hasCode ? "received" : String(data.status || "").toLowerCase() === "cancelled" ? "cancelled" : "waiting";
  return {
    activationId: data.id,
    status,
    code: hasCode ? String(data.code) : null,
    phoneNumber: data.number,
  };
}

// Allowed once the account's cancellation window has passed (5 minutes on
// accounts without immediate cancellation — see Getatext's docs; NexaVerify's
// own timeout sweep runs at 3 minutes, so on an account without instant
// cancellation, a manual cancel in that first-5-minutes window can fail while
// the 3-minute auto-cancel sweep is still the one that eventually succeeds).
// No `refund` boolean in the response (unlike DaisySim) — a successful,
// non-throwing call is treated as full refund confirmation on its own, same
// convention as DaisySMS elsewhere in this app.
export async function cancelActivation(activationId) {
  const data = await call("POST", "/cancel-rental", { id: activationId });
  return { activationId: data.id, refund: true, balanceAfter: Number(data.balance || 0) };
}

// Shared by lib/usOnlyCatalog.js (display) and app/api/us-only/buy/route.js
// (the actual charge) so the two can never drift apart — pure math, no
// provider dependency, unchanged from the provider this replaces.
export function computeNgnPrice(usdPrice, usdRate, markupNgn) {
  const ngn = Number(usdPrice || 0) * Number(usdRate || 0) + Number(markupNgn || 0);
  return Math.max(0, Math.round(ngn * 100) / 100);
}
