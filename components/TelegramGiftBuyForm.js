"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useCurrency } from "./CurrencyProvider";
import { computeStarTotalPrice } from "@/lib/istar-pricing";

const MONTH_OPTIONS = [3, 6, 12];
const STAR_PRESETS = [50, 100, 250, 500, 750, 1000, 1500, 2500];

// Shared buy flow for both the admin test view and the real customer view
// (see app/(customer)/products/telegram-premium/page.js) — same two tabs,
// search a recipient, review the found name, buy, then poll status since the
// webhook may not be reachable yet. Debits the CALLING user's own NGN
// wallet either way.
//
// `isAdminView` controls what's shown, not what's callable — the API routes
// are the real gate (istar_config.enabled / customer_visible). Every order
// is paid from the USDT wallet — the only currency self-learning star
// pricing can actually convert to Naira (see lib/istar.js#learnStarCostFromOrder)
// — so there's no wallet picker at all; customers never saw one anyway
// (that was always an internal detail, not their choice), and admin testing
// now matches. Customers also never see the raw provider order id, matching
// the white-labeling rule used everywhere else in this app.
//
// `starPricingConfig` ({ ngnPerStar, flatMarkupUnder1000, flatMarkupOver1000,
// starLastCostNgn }, fed straight into lib/istar-pricing.js#computeStarTotalPrice)
// and `premiumPricing` (per-duration {costNgn, markupNgn, priceNgn} from
// lib/istar.js#buildPremiumPricing) are for DISPLAY only — the buy route
// always recomputes the real charge itself at purchase time, so a stale
// prop here can never under/overcharge anyone. starPricingConfig is an
// object rather than one flat number because the markup is a FLAT amount
// added once per order (not per star) and which flat amount applies is
// tiered by quantity (under 1,000 vs 1,000+), so each preset button needs
// its own total computed for its own quantity.
export default function TelegramGiftBuyForm({ isAdminView = false, starPricingConfig = {}, premiumPricing = {} }) {
  const router = useRouter();
  const [tab, setTab] = useState("star");

  return (
    <div className="card card-pad max-w-xl">
      <div className="flex rounded-lg bg-gray-100 dark:bg-night-800 p-0.5 text-sm font-semibold mb-5 w-fit">
        <button
          type="button"
          onClick={() => setTab("star")}
          className={`px-3.5 py-1.5 rounded-md transition ${
            tab === "star"
              ? "bg-white dark:bg-night-900 text-brand-700 dark:text-brand-400 shadow-sm"
              : "text-gray-500 dark:text-night-400"
          }`}
        >
          Star Gifting
        </button>
        <button
          type="button"
          onClick={() => setTab("premium")}
          className={`px-3.5 py-1.5 rounded-md transition ${
            tab === "premium"
              ? "bg-white dark:bg-night-900 text-brand-700 dark:text-brand-400 shadow-sm"
              : "text-gray-500 dark:text-night-400"
          }`}
        >
          Premium Gifts
        </button>
      </div>

      {tab === "star" ? (
        <GiftFlow key="star" mode="star" router={router} isAdminView={isAdminView} starPricingConfig={starPricingConfig} />
      ) : (
        <GiftFlow key="premium" mode="premium" router={router} isAdminView={isAdminView} premiumPricing={premiumPricing} />
      )}
    </div>
  );
}

function GiftFlow({ mode, router, isAdminView, starPricingConfig = {}, premiumPricing = {} }) {
  const { format } = useCurrency();
  const [username, setUsername] = useState("");
  const [quantity, setQuantity] = useState(STAR_PRESETS[0]);
  const [customQuantity, setCustomQuantity] = useState(false);
  const [months, setMonths] = useState(3);
  const walletType = "USDT"; // always USDT — see header comment

  const [recipient, setRecipient] = useState(null);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState(null);
  const [polling, setPolling] = useState(false);

  const qty = Number(quantity) || 0;
  // The flat markup tier depends on THIS quantity, so the total isn't just
  // "per-star price x quantity" — recompute the whole total for whatever
  // quantity is currently selected.
  const starPrice = qty > 0 ? computeStarTotalPrice(starPricingConfig, qty) : null;
  const premiumPrice = premiumPricing?.[months]?.priceNgn ?? null;
  const displayPrice = mode === "star" ? starPrice : premiumPrice;

  async function search(e) {
    e.preventDefault();
    setError("");
    setRecipient(null);
    setOrder(null);
    setSearching(true);
    try {
      const params =
        mode === "star"
          ? new URLSearchParams({ username, quantity: String(qty) })
          : new URLSearchParams({ username, months: String(months) });
      const res = await fetch(`/api/telegram/${mode}/search-recipient?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Recipient search failed");
      setRecipient(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function buy() {
    if (!recipient?.recipient) return;
    setError("");
    setBuying(true);
    try {
      const body =
        mode === "star"
          ? { username, recipientHash: recipient.recipient, quantity: qty, walletType }
          : { username, recipientHash: recipient.recipient, months: Number(months), walletType };
      const res = await fetch(`/api/telegram/${mode}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      setOrder(data.order);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBuying(false);
    }
  }

  async function refreshStatus() {
    if (!order?.id) return;
    setPolling(true);
    setError("");
    try {
      const res = await fetch(`/api/telegram/orders/${order.id}/status`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not check status");
      setOrder(data.order);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setPolling(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={search} className="space-y-4">
        <div>
          <label className="font-bold text-sm block mb-2">Telegram username</label>
          <input
            type="text"
            required
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setRecipient(null);
              setOrder(null);
            }}
            placeholder="e.g. durov"
            className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
          />
        </div>

        {mode === "star" ? (
          <div>
            <label className="font-bold text-sm block mb-2">Quantity</label>
            <div className="grid grid-cols-3 gap-2">
              {STAR_PRESETS.map((preset) => {
                // Each preset gets its own total computed for ITS OWN
                // quantity — the flat markup tier (under vs 1,000+) depends
                // on the button's quantity, not whatever's currently selected.
                const presetTotal = computeStarTotalPrice(starPricingConfig, preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setCustomQuantity(false);
                      setQuantity(preset);
                    }}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-semibold text-center transition ${
                      !customQuantity && qty === preset
                        ? "border-brand-500 bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-300"
                        : "border-gray-200 dark:border-night-600 text-gray-500 dark:text-night-400"
                    }`}
                  >
                    {preset}
                    <span className="block text-[11px] font-normal opacity-80">
                      {presetTotal > 0 ? format(presetTotal) : "—"}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCustomQuantity(true)}
                className={`rounded-lg border px-3 py-2.5 text-sm font-semibold text-center transition ${
                  customQuantity
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-300"
                    : "border-gray-200 dark:border-night-600 text-gray-500 dark:text-night-400"
                }`}
              >
                Custom
                <span className="block text-[11px] font-normal opacity-80">Enter amount</span>
              </button>
            </div>
            {customQuantity && (
              <input
                type="number"
                min="50"
                max="1000000"
                required
                autoFocus
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Quantity"
                className="w-full mt-2.5 rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
              />
            )}
          </div>
        ) : (
          <div>
            <label className="font-bold text-sm block mb-2">Duration</label>
            <div className="flex gap-2">
              {MONTH_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    months === m
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-300"
                      : "border-gray-200 dark:border-night-600 text-gray-500 dark:text-night-400"
                  }`}
                >
                  {m} months
                  <span className="block text-[11px] font-normal opacity-80">
                    {premiumPricing?.[m]?.priceNgn ? format(premiumPricing[m].priceNgn) : "—"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button type="submit" disabled={searching} className="btn-secondary w-full">
          {searching ? "Searching…" : "Search recipient"}
        </button>
      </form>

      {recipient && (
        <div className="rounded-lg border border-gray-100 dark:border-night-700 p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{recipient.name || `@${username}`}</div>
            <div className="text-xs text-gray-400 dark:text-night-400">
              Recipient found{displayPrice ? ` — ${format(displayPrice)}` : ""}
            </div>
          </div>
          <button type="button" onClick={buy} disabled={buying} className="btn-primary shrink-0">
            {buying ? "Placing order…" : "Buy"}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {order && (
        <div className="rounded-lg border border-gray-100 dark:border-night-700 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm">Order status</span>
            <button
              type="button"
              onClick={refreshStatus}
              disabled={polling}
              className="text-xs font-semibold text-brand-700 dark:text-brand-400 flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw size={13} className={polling ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
          <div className="text-sm text-gray-500 dark:text-night-300">
            {isAdminView && <span className="font-mono text-xs">{order.istar_order_id}</span>}
            {isAdminView && " — "}
            <span className="font-semibold capitalize">{order.status}</span>
          </div>
          {order.error_message && (
            <p className="text-xs text-red-600 dark:text-red-400">{order.error_message}</p>
          )}
          <p className="text-xs text-gray-400 dark:text-night-400">
            {isAdminView
              ? 'If this stays "pending" for a while, the webhook likely hasn\'t landed yet — tap Refresh to poll iStar directly.'
              : 'If this stays "pending" for a while, tap Refresh to check for an update.'}
          </p>
        </div>
      )}
    </div>
  );
}
