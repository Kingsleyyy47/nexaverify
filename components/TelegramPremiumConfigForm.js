"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MONTH_OPTIONS = [3, 6, 12];

// `config` comes from admin/telegram-premium/page.js as:
// { enabled, customerVisible, ngnPerStar, starMarkupNgn, starLastCostNgn,
//   starLastCostWalletType, starLastCostUpdatedAt, premiumMarkup3,
//   premiumMarkup6, premiumMarkup12, updatedAt }
// `livePricing` is { 3: {costNgn, markupNgn, priceNgn} | null, 6: ..., 12: ... } —
// fetched fresh from iStar on every page load, so the admin sees exactly
// what's being charged right now before deciding on a markup.
export default function TelegramPremiumConfigForm({ config, livePricing = {} }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(Boolean(config.enabled));
  const [customerVisible, setCustomerVisible] = useState(Boolean(config.customerVisible));
  const [ngnPerStar, setNgnPerStar] = useState(config.ngnPerStar ?? "");
  const [starMarkupNgn, setStarMarkupNgn] = useState(config.starMarkupNgn ?? "");
  const [markups, setMarkups] = useState({
    3: config.premiumMarkup3 ?? "",
    6: config.premiumMarkup6 ?? "",
    12: config.premiumMarkup12 ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/telegram-premium/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          customerVisible,
          ngnPerStar: Number(ngnPerStar),
          starMarkupNgn: Number(starMarkupNgn),
          premiumMarkup3: Number(markups[3]),
          premiumMarkup6: Number(markups[6]),
          premiumMarkup12: Number(markups[12]),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save settings");

      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      <div className="pb-5 border-b border-gray-100 dark:border-night-800">
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-sm">Telegram Premium &amp; Stars</span>
          <div className="flex rounded-lg bg-gray-100 dark:bg-night-800 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setEnabled(false)}
              className={`px-2.5 py-1 rounded-md transition ${
                !enabled
                  ? "bg-white dark:bg-night-900 text-brand-700 dark:text-brand-400 shadow-sm"
                  : "text-gray-500 dark:text-night-400"
              }`}
            >
              Off
            </button>
            <button
              type="button"
              onClick={() => setEnabled(true)}
              className={`px-2.5 py-1 rounded-md transition ${
                enabled
                  ? "bg-white dark:bg-night-900 text-brand-700 dark:text-brand-400 shadow-sm"
                  : "text-gray-500 dark:text-night-400"
              }`}
            >
              On
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-night-400">
          Controls whether you (admin) can actually place a test order on{" "}
          <span className="font-mono">/products/telegram-premium</span> — always available to you
          regardless of the switch below.
        </p>
      </div>

      <div className="pb-5 border-b border-gray-100 dark:border-night-800">
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-sm">Let customers see it</span>
          <div className="flex rounded-lg bg-gray-100 dark:bg-night-800 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setCustomerVisible(false)}
              className={`px-2.5 py-1 rounded-md transition ${
                !customerVisible
                  ? "bg-white dark:bg-night-900 text-brand-700 dark:text-brand-400 shadow-sm"
                  : "text-gray-500 dark:text-night-400"
              }`}
            >
              Off
            </button>
            <button
              type="button"
              onClick={() => setCustomerVisible(true)}
              className={`px-2.5 py-1 rounded-md transition ${
                customerVisible
                  ? "bg-white dark:bg-night-900 text-brand-700 dark:text-brand-400 shadow-sm"
                  : "text-gray-500 dark:text-night-400"
              }`}
            >
              On
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-night-400">
          A second, separate switch from "Enabled" above. Off (default): every customer sees
          "Coming soon" no matter what. On: real customers get the actual buy flow too, billed from
          their own wallet — with a simplified view (no wallet picker, no order IDs). Only flip this
          once you're happy with your own test purchases above.
        </p>
      </div>

      <div>
        <label className="font-bold text-sm block mb-2">Starting price per star (₦)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          required
          value={ngnPerStar}
          onChange={(e) => setNgnPerStar(e.target.value)}
          className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
        />
        <p className="text-xs text-gray-400 dark:text-night-400 mt-1.5">
          A guess, used only until "What you're charged (Stars)" above has real data. A buyer's
          total is always <span className="font-mono">quantity × per-star price</span>, kept
          deliberately simple.
        </p>
      </div>

      <div>
        <label className="font-bold text-sm block mb-2">Per-star markup (₦)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          required
          value={starMarkupNgn}
          onChange={(e) => setStarMarkupNgn(e.target.value)}
          className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
        />
        <p className="text-xs text-gray-400 dark:text-night-400 mt-1.5">
          Added on top of the learned cost once it exists —{" "}
          <span className="font-mono">learned cost + this amount = price per star</span>. Has no
          effect until the first real cost is learned; see the table above for the current numbers.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="font-bold text-sm">Premium markup — per duration (₦)</label>
        </div>
        <p className="text-xs text-gray-400 dark:text-night-400 mb-3">
          Each duration is priced separately: iStar's own live cost for that specific package
          (re-fetched fresh every time someone buys, so it never goes stale) plus the markup you set
          here. The cost shown below updates on page load — set your markup high enough to cover it,
          or you'll be selling at a loss.
        </p>
        <div className="space-y-3">
          {MONTH_OPTIONS.map((m) => {
            const live = livePricing[m];
            return (
              <div key={m} className="rounded-lg border border-gray-200 dark:border-night-600 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">{m} months</span>
                  <span className="text-xs text-gray-400 dark:text-night-400">
                    {live ? `Cost now: ₦${live.costNgn.toLocaleString()}` : "Cost unavailable"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={markups[m]}
                    onChange={(e) => setMarkups((prev) => ({ ...prev, [m]: e.target.value }))}
                    placeholder="Markup"
                    className="flex-1 rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3.5 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
                  />
                  {live && (
                    <span className="text-sm font-bold text-brand-700 dark:text-brand-400 shrink-0">
                      = ₦{(live.costNgn + Number(markups[m] || 0)).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {saved && <p className="text-sm text-brand-700 dark:text-brand-400">Settings updated.</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
