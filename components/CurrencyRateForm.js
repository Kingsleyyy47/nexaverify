"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// `rates` comes from admin/currency/page.js as:
// { USD: { ngnPerUnit, autoNgnPerUnit, manualOverride, updatedAt }, GBP: {...}, EUR: {...} }
export default function CurrencyRateForm({ rates }) {
  const router = useRouter();
  const [mode, setMode] = useState({
    USD: rates.USD.manualOverride ? "custom" : "live",
    GBP: rates.GBP.manualOverride ? "custom" : "live",
    EUR: rates.EUR.manualOverride ? "custom" : "live",
  });
  const [customValue, setCustomValue] = useState({
    USD: rates.USD.ngnPerUnit ?? "",
    GBP: rates.GBP.ngnPerUnit ?? "",
    EUR: rates.EUR.ngnPerUnit ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function setModeFor(currency, next) {
    setMode((prev) => ({ ...prev, [currency]: next }));
  }

  function setValueFor(currency, value) {
    setCustomValue((prev) => ({ ...prev, [currency]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setLoading(true);

    const body = {};
    for (const currency of ["USD", "GBP", "EUR"]) {
      body[currency] =
        mode[currency] === "custom"
          ? { mode: "custom", value: Number(customValue[currency]) }
          : { mode: "live" };
    }

    try {
      const res = await fetch("/api/admin/currency-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save rates");

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
      {["USD", "GBP", "EUR"].map((currency) => {
        const r = rates[currency];
        const isLive = mode[currency] === "live";
        return (
          <div key={currency} className="pb-5 border-b border-gray-100 dark:border-night-800 last:border-0 last:pb-0">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm">₦ per 1 {currency}</span>
              <div className="flex rounded-lg bg-gray-100 dark:bg-night-800 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setModeFor(currency, "live")}
                  className={`px-2.5 py-1 rounded-md transition ${
                    isLive
                      ? "bg-white dark:bg-night-900 text-brand-700 dark:text-brand-400 shadow-sm"
                      : "text-gray-500 dark:text-night-400"
                  }`}
                >
                  Live
                </button>
                <button
                  type="button"
                  onClick={() => setModeFor(currency, "custom")}
                  className={`px-2.5 py-1 rounded-md transition ${
                    !isLive
                      ? "bg-white dark:bg-night-900 text-brand-700 dark:text-brand-400 shadow-sm"
                      : "text-gray-500 dark:text-night-400"
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>

            {isLive ? (
              <div className="rounded-lg border border-gray-200 dark:border-night-600 bg-gray-50 dark:bg-night-950 px-3.5 py-2.5 text-sm">
                <span className="font-semibold">
                  {r.autoNgnPerUnit ? `₦${Number(r.autoNgnPerUnit).toLocaleString()}` : "Not fetched yet"}
                </span>
                <span className="text-gray-400 dark:text-night-400 ml-2">
                  {r.autoNgnPerUnit
                    ? `Last refreshed ${new Date(r.updatedAt).toLocaleString()}`
                    : 'Click "Refresh live rates" above'}
                </span>
              </div>
            ) : (
              <input
                type="number"
                min="0"
                step="0.0001"
                required={!isLive}
                value={customValue[currency]}
                onChange={(e) => setValueFor(currency, e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
              />
            )}
          </div>
        );
      })}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {saved && <p className="text-sm text-brand-700 dark:text-brand-400">Rates updated.</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Saving…" : "Save rates"}
      </button>
    </form>
  );
}
