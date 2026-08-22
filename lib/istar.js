import "server-only";
import { randomUUID } from "crypto";

// Thin wrapper around iStar's Telegram Stars / Premium gifting API
// (https://v1.fragmentapi.com/api/v1/partner). Genuinely different shape
// from every other provider in this app: it doesn't rent phone numbers, it
// spends TON or USDT-on-TON from YOUR OWN iStar developer wallet to gift
// Telegram Stars or Telegram Premium to a username, and order processing is
// asynchronous (create returns "pending"; a webhook or a status poll tells
// you "completed"/"failed" later — see app/api/telegram/webhook and
// app/api/telegram/orders/[id]/status).
//
// Auth is a plain `API-Key` header (NOT `Authorization: Bearer`, unlike
// DaisySim/PocketFi) — easy to get wrong by copy-pasting the wrong pattern
// from another lib/*.js file in this project, so double-check if requests
// start failing with 401.
//
// This file is server-only: it reads ISTAR_API_KEY from the environment and
// must never be imported from a Client Component.

const BASE_URL = process.env.ISTAR_BASE_URL || "https://v1.fragmentapi.com/api/v1/partner";
const API_KEY = process.env.ISTAR_API_KEY;

export class IStarError extends Error {
  constructor(code, message, status) {
    super(message || code);
    this.name = "IStarError";
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
      throw new IStarError("TIMEOUT", "The gifting provider didn't respond in time — please try again, or contact support if this keeps happening.");
    }
    throw new IStarError("NETWORK_ERROR", "Could not reach the gifting provider — please try again, or contact support if this keeps happening.");
  } finally {
    clearTimeout(timeout);
  }
}

async function call(method, path, { params, body, idempotencyKey } = {}) {
  if (!API_KEY) {
    throw new IStarError("NO_API_KEY", "The gifting provider isn't configured yet — contact support.");
  }

  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = {
    "API-Key": API_KEY,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await fetchWithTimeout(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // Keep the raw snippet ONLY in the server log — never in a message that
    // could reach a customer, since it may contain provider-identifying text.
    console.error(`[lib/istar] non-JSON response from ${path}:`, text.slice(0, 200));
    throw new IStarError("BAD_JSON", "The gifting provider sent back an unexpected response — please try again, or contact support if this keeps happening.", res.status);
  }

  if (!res.ok) {
    // Docs don't show one consistent error envelope shape, so check the
    // usual suspects rather than assuming a single field name. A provider's
    // own error text (data.error/data.message) can be genuinely useful for
    // debugging, so it's kept for admins — customerSafeMessage() in the API
    // routes is what strips it back down to something generic for everyone
    // else. Always logged in full server-side too (not just the non-JSON
    // case above) so the exact raw envelope is checkable in Vercel logs when
    // the trimmed admin-facing message isn't enough to diagnose something —
    // e.g. a recipient search that fails for premium but succeeds for stars.
    console.error(`[lib/istar] ${method} ${path} -> HTTP ${res.status}:`, JSON.stringify(data).slice(0, 500));
    const message = data.error || data.message || `The gifting provider returned an error (HTTP ${res.status}).`;
    throw new IStarError(data.code || `HTTP_${res.status}`, message, res.status);
  }

  return data;
}

// { success, myself, recipient, name, photo } — `recipient` is the
// recipient_hash you pass straight into createStarOrder.
export async function searchStarRecipient({ username, quantity }) {
  return call("GET", "/star/recipient/search", { params: { username, quantity } });
}

// { success, myself, recipient, name, photo }
export async function searchPremiumRecipient({ username, months }) {
  return call("GET", "/premium/recipient/search", { params: { username, months } });
}

// { order_id, status: "pending", username, quantity, amount, created_at }
// `amount` is in whatever currency walletType is (TON by default). Rate
// limited to 1 req/sec per API key by iStar — fine for admin-only manual
// testing, but don't fire these in a tight loop.
export async function createStarOrder({ username, recipientHash, quantity, walletType = "TON" }) {
  return call("POST", "/orders/star", {
    idempotencyKey: randomUUID(),
    body: { username, recipient_hash: recipientHash, quantity, wallet_type: walletType },
  });
}

// { order_id, status: "pending", username, months, amount, created_at }
export async function createPremiumOrder({ username, recipientHash, months, walletType = "TON" }) {
  return call("POST", "/orders/premium", {
    idempotencyKey: randomUUID(),
    body: { username, recipient_hash: recipientHash, months, wallet_type: walletType },
  });
}

// { status: "pending"|"processing"|"completed"|"failed", amount, payload, ... }
// The primary source of truth is the webhook (app/api/telegram/webhook) —
// this is the fallback for when a webhook delivery never arrives.
export async function getOrderStatus(orderId) {
  return call("GET", `/orders/${encodeURIComponent(orderId)}`);
}

// [{ months, usd_value, ton_value }, ...] — the only place iStar exposes a
// live, pre-purchase price. There's no equivalent live-price lookup for
// star gifting (the `amount` for a star order only appears in the order
// creation response itself), so star pricing here is admin-set manually
// (see public.istar_config.ngn_per_star) rather than converted from a live
// USD rate the way premium is.
export async function getPremiumPackages() {
  return call("GET", "/premium/packages");
}

// { wallet_id, balance, currency, updated_at }
export async function getWalletBalance(walletType = "TON") {
  return call("GET", "/wallet/balance", { params: { wallet_type: walletType } });
}

// Shared by the premium buy route and the admin settings page (for display)
// so the two price the same way — live USD value x admin's usdRate, plus
// the admin's flat NGN markup for that specific duration
// (public.istar_config.premium_markup_3/6/12).
export function computeNgnPrice(usdValue, usdRate, markupNgn) {
  const ngn = Number(usdValue || 0) * Number(usdRate || 0) + Number(markupNgn || 0);
  return Math.max(0, Math.round(ngn * 100) / 100);
}

// Builds { 3: {costNgn, markupNgn, priceNgn} | null, 6: ..., 12: ... } from a
// live getPremiumPackages() response, a USD->NGN rate, and the admin's
// per-duration markups. Shared by /admin/telegram-premium (which also shows
// costNgn, so the admin can see exactly what iStar is charging before they
// set a markup and risk a loss) and the customer/admin buy page (which only
// shows priceNgn). Uses Number(p.months) rather than a strict === compare
// since iStar's JSON has, in practice, returned `months` as either a number
// or a numeric string depending on the package — a strict compare here was
// the actual cause of premium purchases silently finding "no package" and
// failing.
export function buildPremiumPricing(packages, usdRate, markups = {}) {
  const result = {};
  for (const months of [3, 6, 12]) {
    const pkg = (packages || []).find((p) => Number(p.months) === months);
    if (!pkg || !usdRate) {
      result[months] = null;
      continue;
    }
    const costNgn = Math.max(0, Math.round(Number(pkg.usd_value || 0) * Number(usdRate) * 100) / 100);
    const markupNgn = Number(markups[months] || 0);
    result[months] = {
      costNgn,
      markupNgn,
      priceNgn: Math.round((costNgn + markupNgn) * 100) / 100,
    };
  }
  return result;
}

// Moved to lib/istar-pricing.js (no "server-only", so the buy form can call
// it directly from the browser too) — re-exported here so existing server
// imports from "@/lib/istar" keep working.
export { computeStarTotalPrice } from "./istar-pricing";

// Called from app/api/telegram/webhook (order.completed) and
// app/api/telegram/orders/[id]/status whenever a STAR order transitions to
// "completed" — the one moment the real charged amount is actually known.
//
// Only CONVERTS to a NGN price for USDT orders (USDT is pegged ~1:1 to USD,
// so (amount / quantity) x currency_rates.USD is a reliable conversion — TON
// orders are skipped for the conversion since there's no TON->NGN rate
// anywhere in this app). But every attempt — successful or not — is always
// recorded on istar_config.star_learn_last_* so a failure to learn is never
// silent again (this replaced an earlier version that just `return false`d
// with nothing written anywhere, which is exactly why a completed order's
// missed learn was invisible and took this long to track down).
//
// `admin` is a service-role Supabase client (the caller already has one).
export async function learnStarCostFromOrder(admin, { quantity, amount, walletType }) {
  const now = new Date().toISOString();
  const diagnostic = {
    star_learn_last_attempt_at: now,
    star_learn_last_raw_amount: amount != null ? Number(amount) : null,
    star_learn_last_raw_quantity: quantity != null ? Number(quantity) : null,
    star_learn_last_wallet_type: walletType || null,
  };

  async function record(status, note) {
    await admin
      .from("istar_config")
      .update({ ...diagnostic, star_learn_last_status: status, star_learn_last_note: note })
      .eq("id", true);
  }

  if (!quantity || !amount || Number(quantity) <= 0 || !Number.isFinite(Number(amount))) {
    await record("skipped_no_amount", `Missing/invalid quantity or amount from provider (quantity=${quantity}, amount=${amount}).`);
    return false;
  }

  if (walletType !== "USDT") {
    await record("skipped_wallet", `Order paid in ${walletType || "an unknown wallet"} — only USDT orders convert to NGN reliably.`);
    return false;
  }

  const { data: usdRateRow } = await admin
    .from("currency_rates")
    .select("ngn_per_unit")
    .eq("currency", "USD")
    .maybeSingle();
  const usdRate = usdRateRow ? Number(usdRateRow.ngn_per_unit) : null;
  if (!usdRate) {
    await record("skipped_no_rate", "No USD row in currency_rates — set one at /admin/currency to enable conversion.");
    return false;
  }

  const perStarNgn = (Number(amount) / Number(quantity)) * usdRate;
  if (!Number.isFinite(perStarNgn) || perStarNgn <= 0) {
    await record("skipped_invalid", `Computed per-star price was invalid (${perStarNgn}).`);
    return false;
  }

  await admin
    .from("istar_config")
    .update({
      ...diagnostic,
      star_learn_last_status: "learned",
      star_learn_last_note: null,
      star_last_cost_ngn: Math.round(perStarNgn * 10000) / 10000,
      star_last_cost_wallet_type: "USDT",
      star_last_cost_updated_at: now,
    })
    .eq("id", true);

  return true;
}
