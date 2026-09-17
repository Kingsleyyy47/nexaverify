import "server-only";

// Thin wrapper around DaisySim's dedicated USA numbers REST API ("server7":
// https://daisysim.com/api/v1/server7) — a SEPARATE, USA-only API from
// DaisySim's general multi-country product (lib/daisysim.js, "All
// countries"), despite both living on daisysim.com. This is the ORIGINAL
// backend for the "US Only" product slot, replaced by Getatext
// (lib/getatext.js) at one point, and rebuilt here (Sept 2026) as a
// toggleable ALTERNATIVE to Getatext — see public.daisysim_usa_config.backend
// — after Getatext started hitting Cloudflare-block issues. Never both
// active for the same rental at once; see the big schema.sql comment on
// rentals.us_only_backend for how an in-flight rental remembers which of the
// two backends actually fulfilled it, independent of the config's current
// value.
//
// Shape-wise this is close to lib/daisysim.js (same `{success, message,
// data}` envelope, same Bearer auth, same /balance, /purchase, /check/{id},
// /cancel/{id}, /history endpoint names) but simpler: one flat per-service
// price already baked in (no separate price-tier fetch step, no price
// passed on purchase — the server resolves it from the service code alone),
// and USA-only (no country picker, `country` is always "USA").
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
    // Full parsed response body. Needed for CODE_RECEIVED on /cancel — the
    // docs say a code that arrived in the race window is included IN `data`
    // (i.e. raw?.data?.code), distinct from the top-level `code` field
    // that's just the error type ("CODE_RECEIVED" itself).
    this.raw = raw;
  }
}

// Every request gets a hard timeout — same reasoning as lib/daisy.js,
// lib/daisysim.js and lib/pocketfi.js: a slow/unresponsive provider should
// fail loudly instead of hanging the calling route indefinitely.
const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new DaisySimUsaError("TIMEOUT", `DaisySim USA did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw new DaisySimUsaError("NETWORK_ERROR", `Could not reach DaisySim USA: ${err.message}`);
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
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new DaisySimUsaError("BAD_JSON", `Expected JSON from DaisySim USA, got: ${text.slice(0, 200)}`);
  }

  if (!data.success) {
    // Machine-readable error envelope: { success: false, message, code }
    // (plus, for CODE_RECEIVED specifically, a `data` object carrying the
    // actual SMS code — see DaisySimUsaError.raw above). Branch on `code`,
    // never on `message` text, per the API docs' own explicit guidance.
    throw new DaisySimUsaError(data.code || `HTTP_${res.status}`, data.message || `DaisySim USA returned HTTP ${res.status}`, data);
  }
  if (!res.ok) {
    // Belt and suspenders — every documented error case does set
    // success:false, but a non-2xx with success:true would otherwise slip
    // through untouched.
    throw new DaisySimUsaError(`HTTP_${res.status}`, `DaisySim USA returned HTTP ${res.status}`, data);
  }

  return data.data;
}

// { balance, currency: "USD", email }
export async function getBalance() {
  const data = await call("GET", "/balance");
  return { balance: Number(data.balance || 0), currency: data.currency || "USD", email: data.email };
}

// [{ id: "USA", name: "USA" }, ...] — USA-only for now per the docs, kept as
// a real call (rather than hardcoded) in case the provider ever adds more.
export async function getCountries() {
  const data = await call("GET", "/countries");
  return data.countries || [];
}

// [{ code, name, price }, ...] — price already includes this account's own
// rate; sold-out services are simply omitted by the provider. `country`
// defaults to "USA" for interface parity with lib/getatext.js's getApps()
// (which ignores the argument entirely) and lib/daisysim.js's country-scoped
// equivalent — this provider only ever has the one country regardless.
// Provider-side cache: prices 5 min, catalogue 30 min — no need to debounce
// on our side beyond that.
export async function getApps(country = "USA") {
  const data = await call("GET", `/apps/${encodeURIComponent(country)}`);
  const list = Array.isArray(data) ? data : Array.isArray(data?.apps) ? data.apps : [];
  return list
    .filter((item) => item && item.code)
    .map((item) => ({
      code: item.code,
      name: item.name,
      price: Number(item.price || 0),
      stock: null, // not part of this endpoint's documented shape — sold-out services are omitted instead
    }));
}

// `app` must be a service code copied verbatim from getApps() — the server
// resolves the live price from the code alone; never send a price. Rate
// limited to 10/60s. `country`/`countryName` accepted only for interface
// parity with the sibling provider libs (this API is USA-only).
export async function purchaseNumber({ app, appName, country = "USA", countryName }) {
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
    amountCharged: Number(data.amount_charged || 0),
    balanceAfter: Number(data.balance_after || 0),
  };
}

// { activationId, status: "waiting"|"received"|"cancelled", code, phoneNumber }
// normalized to match NexaVerify's own rentals.status vocabulary (the
// provider's own casing is "Waiting"/"Completed"/"Cancelled"). Response is
// cached provider-side for 15s while waiting. Rate limited to 60/60s.
export async function checkStatus(activationId) {
  const data = await call("GET", `/check/${encodeURIComponent(activationId)}`);
  const statusMap = { waiting: "waiting", completed: "received", cancelled: "cancelled" };
  return {
    activationId: data.activation_id ?? activationId,
    status: statusMap[String(data.status || "").toLowerCase()] || "waiting",
    code: data.code ?? null,
    phoneNumber: data.phone_number,
  };
}

// Batch status check, max 20 ids, counts as a single request against the
// rate limit — not currently wired into any route (NexaVerify polls one
// rental at a time via checkStatus, same as every other provider), but kept
// here for parity with the documented API and for any future admin
// reconciliation tooling. Per-item statuses also include "Not Found" and
// "Invalid" — passed through as-is (lowercased) rather than forced into the
// waiting/received/cancelled vocabulary, since callers here would need to
// react to them differently than a normal status.
export async function checkAll(activationIds) {
  const data = await call("POST", "/check-all", { ids: activationIds });
  const items = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
  return items.map((item) => ({
    activationId: item.activation_id,
    status: String(item.status || "").toLowerCase(),
    code: item.code ?? null,
  }));
}

// Refunds the full amount. Locked for the first 180s after purchase
// (TOO_EARLY, with exact seconds remaining in the message) and once a code
// has already arrived in the exact race window (CODE_RECEIVED, 422 — the
// docs are explicit that this should be treated as a successful check, not
// a failure: "you keep the code and the charge stands"). Cancelling twice is
// safe (reports already-processed); a concurrent cancel loses with
// IN_PROGRESS (409) and should be retried once by the caller. Rate limited
// to 10/60s.
export async function cancelActivation(activationId) {
  const data = await call("POST", `/cancel/${encodeURIComponent(activationId)}`);
  return {
    activationId: data.activation_id ?? activationId,
    refund: Number(data.refund || 0) > 0 || data.refund === true,
    balanceAfter: Number(data.balance_after || 0),
  };
}

// Shared by lib/usOnlyCatalog.js (display) and app/api/us-only/buy/route.js
// (the actual charge) so the two can never drift apart — pure math, no
// provider dependency, identical to the sibling providers' own copy of this
// function (lib/getatext.js, lib/daisysim.js).
export function computeNgnPrice(usdPrice, usdRate, markupNgn) {
  const ngn = Number(usdPrice || 0) * Number(usdRate || 0) + Number(markupNgn || 0);
  return Math.max(0, Math.round(ngn * 100) / 100);
}

// Not used anywhere yet — NexaVerify's own rentals table is the source of
// truth for a customer's order history, so this is here only in case admin
// reconciliation against the provider's own records is ever needed. Per the
// docs, cancelled orders disappear entirely from this endpoint — refunds
// must be reconciled from NexaVerify's own records, not this.
export async function getHistory({ status, perPage = 20, page = 1 } = {}) {
  const params = new URLSearchParams({ per_page: String(perPage), page: String(page) });
  if (status) params.set("status", status);
  const data = await call("GET", `/history?${params.toString()}`);
  return data;
}
