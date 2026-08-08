import "server-only";

// Thin wrapper around DaisySim's "server7" REST API
// (https://daisysim.com/api/v1/server7) — a THIRD phone-number provider,
// separate from both DaisySMS (lib/daisy.js) and the "All countries"
// DaisySim product (lib/daisysim.js, a different base path/product line on
// DaisySim's side: /api/v1/virtual). This one is USA-only and has a flat
// service catalog: GET /apps/USA already returns every service with its
// live, final price attached — no country picker needed on the customer
// side, no separate pricing call, and no price tiers. POST /purchase
// resolves the price server-side from the service code alone and ignores
// any price sent to it; the real charge comes back as amount_charged and is
// what NexaVerify should treat as authoritative when billing the customer.
// There's no webhook in this API — codes only ever arrive via polling
// GET /check/{id} (or the batch POST /check-all), same shape as how
// NexaVerify already polls DaisySMS.
//
// This file is server-only: it reads DAISYSIM_USA_API_KEY from the
// environment and must never be imported from a Client Component.

const BASE_URL = process.env.DAISYSIM_USA_BASE_URL || "https://daisysim.com/api/v1/server7";
const API_KEY = process.env.DAISYSIM_USA_API_KEY;

export class DaisySimUsaError extends Error {
  constructor(code, message, raw) {
    super(message || code);
    this.name = "DaisySimUsaError";
    this.code = code;
    // Full parsed response body, when there was one — needed for CODE_RECEIVED
    // on /cancel, which the docs confirm includes the code in `data` even
    // though the request itself is rejected (HTTP 422).
    this.raw = raw;
  }
}

// Every request gets a hard timeout — same reasoning as lib/daisy.js,
// lib/daisysim.js, and lib/pocketfi.js: a slow/unresponsive provider should
// fail loudly instead of hanging the calling route indefinitely.
const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new DaisySimUsaError("TIMEOUT", `DaisySim (US) did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw new DaisySimUsaError("NETWORK_ERROR", `Could not reach DaisySim (US): ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function call(method, path, body) {
  if (!API_KEY) {
    throw new DaisySimUsaError("NO_API_KEY", "DAISYSIM_USA_API_KEY is not set in the environment");
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
    throw new DaisySimUsaError("BAD_JSON", `Expected JSON from DaisySim (US), got: ${text.slice(0, 200)}`);
  }

  if (!data.success) {
    // Machine-readable error envelope: { success: false, message, code }.
    // Falls back to a generic code if the response ever omits it. The full
    // body is attached to the error (see DaisySimUsaError.raw) since at
    // least one documented error case (CODE_RECEIVED on /cancel) carries
    // useful data alongside the rejection.
    throw new DaisySimUsaError(data.code || "REQUEST_FAILED", data.message || `DaisySim (US) returned HTTP ${res.status}`, data);
  }

  return data.data;
}

// { balance, currency, email }
export async function getBalance() {
  return call("GET", "/balance");
}

// [{ id, name }, ...] — USA only, per the docs
export async function getCountries() {
  const data = await call("GET", "/countries");
  return data.countries || [];
}

// [{ code, name, price }, ...] for the given country id (always "USA" here)
// — price is already the live, final USD amount that will be debited, no
// separate pricing call needed. Sold-out services are omitted, so this list
// can be rendered directly. Cached ~5 minutes on DaisySim's side, so
// re-fetch right before showing a buy screen rather than reusing an old list.
export async function getApps(countryId = "USA") {
  const data = await call("GET", `/apps/${encodeURIComponent(countryId)}`);
  return Array.isArray(data) ? data : [];
}

// `app` must be a code copied verbatim from getApps() — DaisySim resolves
// the live price server-side from the code alone and ignores any price sent
// here, so this function deliberately doesn't accept one. The real charge
// comes back as amountCharged and should be treated as authoritative — see
// app/api/us-only/buy/route.js for how the final NGN charge is computed
// from this value, not from whatever the client last saw. Rate limited to
// 10/min.
export async function purchaseNumber({ country = "USA", app, appName, countryName = "USA" }) {
  const data = await call("POST", "/purchase", {
    country,
    app,
    ...(appName ? { app_name: appName } : {}),
    ...(countryName ? { country_name: countryName } : {}),
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
// (DaisySim's own casing is "Waiting"/"Completed"/"Cancelled"). Waiting
// responses are cached 15s on DaisySim's side — poll on that cadence, faster
// gains nothing. Rate limited to 60/min.
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

// Batch version of checkSms — up to 20 activation IDs in one call, which
// counts as a single request against the 60/min limit instead of N. Not
// wired into a route yet, available for a future "check all my waiting
// rentals at once" pass. Statuses here can also be "Not Found" or "Invalid"
// (dead IDs) alongside the usual three.
export async function checkAllSms(activationIds) {
  const ids = (activationIds || []).slice(0, 20);
  const data = await call("POST", "/check-all", { ids });
  const statusMap = {
    waiting: "waiting",
    completed: "received",
    cancelled: "cancelled",
    "not found": "not_found",
    invalid: "invalid",
  };
  return (Array.isArray(data) ? data : []).map((item) => ({
    activationId: item.activation_id,
    status: statusMap[String(item.status || "").toLowerCase()] || "waiting",
    code: item.code ?? null,
    phoneNumber: item.phone_number ?? null,
  }));
}

// Allowed once 180s (3 minutes) have passed since purchase, and only while
// no code has arrived yet — DaisySim returns TOO_EARLY / CODE_RECEIVED for
// those cases respectively (the latter includes the code in the response
// body so the caller isn't left empty-handed). Numbers that already expired
// on DaisySim's side are refunded the same way, so it's safe to call this
// without checking status first. Calling it twice is also safe — a repeat
// call reports the refund was already processed rather than refunding again.
// Rate limited to 10/min. NexaVerify's own timeout sweep runs at exactly 3
// minutes too (see app/api/admin/rentals/sweep-timeouts/route.js), so it
// never races this lock.
export async function cancelActivation(activationId) {
  const data = await call("POST", `/cancel/${encodeURIComponent(activationId)}`);
  return { activationId: data.activation_id, refund: data.refund, balanceAfter: data.balance_after };
}

// Shared by lib/usOnlyCatalog.js (display, on both the products page and the
// dashboard) and app/api/us-only/buy/route.js (the actual charge) so the two
// can never drift apart — both call this the same way, using the live
// usdRate and the admin's current markup_amount_ngn (see
// public.daisysim_usa_config). The buy route also calls this a second time
// on the provider's actual amount_charged after purchase, since that — not
// whatever price the customer last saw — is the authoritative USD amount.
export function computeNgnPrice(usdPrice, usdRate, markupNgn) {
  const ngn = Number(usdPrice || 0) * Number(usdRate || 0) + Number(markupNgn || 0);
  return Math.max(0, Math.round(ngn * 100) / 100);
}

// Not used anywhere yet — NexaVerify's own rentals table is the source of
// truth for a customer's order history, so this is here only in case admin
// reconciliation against DaisySim's own records is ever needed. Note:
// cancelled/refunded orders don't appear here — DaisySim removes them from
// history entirely, so reconcile refunds from our own transactions table.
export async function getHistory({ page = 1, perPage = 20, status } = {}) {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (status) params.set("status", status);
  const data = await call("GET", `/history?${params.toString()}`);
  return data;
}
