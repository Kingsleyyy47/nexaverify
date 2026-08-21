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
      throw new IStarError("TIMEOUT", `iStar did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw new IStarError("NETWORK_ERROR", `Could not reach iStar: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function call(method, path, { params, body, idempotencyKey } = {}) {
  if (!API_KEY) {
    throw new IStarError("NO_API_KEY", "ISTAR_API_KEY is not set in the environment");
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
    throw new IStarError("BAD_JSON", `Expected JSON from iStar, got: ${text.slice(0, 200)}`, res.status);
  }

  if (!res.ok) {
    // Docs don't show one consistent error envelope shape, so check the
    // usual suspects rather than assuming a single field name.
    const message = data.error || data.message || `iStar returned HTTP ${res.status}`;
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
// the admin's flat NGN markup (see public.istar_config.markup_amount_ngn).
export function computeNgnPrice(usdValue, usdRate, markupNgn) {
  const ngn = Number(usdValue || 0) * Number(usdRate || 0) + Number(markupNgn || 0);
  return Math.max(0, Math.round(ngn * 100) / 100);
}
