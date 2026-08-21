"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const MONTH_OPTIONS = [3, 6, 12];

// Admin-only test/purchase flow for iStar Telegram gifting. Two tabs sharing
// the same shape: search a recipient, review the found name, buy, then poll
// status since the webhook may not be reachable (e.g. local dev with no
// public URL registered with iStar). Debits the ADMIN's own NGN wallet, same
// as a real customer purchase would.
export default function TelegramGiftBuyForm() {
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

      {tab === "star" ? <GiftFlow key="star" mode="star" router={router} /> : <GiftFlow key="premium" mode="premium" router={router} />}
    </div>
  );
}

function GiftFlow({ mode, router }) {
  const [username, setUsername] = useState("");
  const [quantity, setQuantity] = useState(50);
  const [months, setMonths] = useState(3);
  const [walletType, setWalletType] = useState("TON");

  const [recipient, setRecipient] = useState(null);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState(null);
  const [polling, setPolling] = useState(false);

  async function search(e) {
    e.preventDefault();
    setError("");
    setRecipient(null);
    setOrder(null);
    setSearching(true);
    try {
      const params =
        mode === "star"
          ? new URLSearchParams({ username, quantity: String(quantity) })
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
          ? { username, recipientHash: recipient.recipient, quantity: Number(quantity), walletType }
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
            <label className="font-bold text-sm block mb-2">Quantity (50 – 1,000,000)</label>
            <input
              type="number"
              min="50"
              max="1000000"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
            />
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
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="font-bold text-sm block mb-2">Wallet</label>
          <div className="flex gap-2">
            {["TON", "USDT"].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWalletType(w)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  walletType === w
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-300"
                    : "border-gray-200 dark:border-night-600 text-gray-500 dark:text-night-400"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" disabled={searching} className="btn-secondary w-full">
          {searching ? "Searching…" : "Search recipient"}
        </button>
      </form>

      {recipient && (
        <div className="rounded-lg border border-gray-100 dark:border-night-700 p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{recipient.name || `@${username}`}</div>
            <div className="text-xs text-gray-400 dark:text-night-400">Recipient found — ready to buy.</div>
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
            <span className="font-mono text-xs">{order.istar_order_id}</span> —{" "}
            <span className="font-semibold capitalize">{order.status}</span>
          </div>
          {order.error_message && (
            <p className="text-xs text-red-600 dark:text-red-400">{order.error_message}</p>
          )}
          <p className="text-xs text-gray-400 dark:text-night-400">
            If this stays "pending" for a while, the webhook likely hasn't landed yet — tap Refresh
            to poll iStar directly.
          </p>
        </div>
      )}
    </div>
  );
}
