"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// `config` comes from admin/us-only/page.js as:
// { enabled, markupAmountNgn, updatedAt }
export default function UsOnlyConfigForm({ config }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(Boolean(config.enabled));
  const [markup, setMarkup] = useState(config.markupAmountNgn ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/us-only/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, markupAmountNgn: Number(markup) }),
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
          <span className="font-bold text-sm">US Only</span>
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
          Turns the "US Only" product on or off for customers. A separate USA-only numbers
          provider from the regular DaisySMS catalog and from "All countries".
        </p>
      </div>

      <div>
        <label className="font-bold text-sm block mb-2">Default markup (₦ added per number)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          required
          value={markup}
          onChange={(e) => setMarkup(e.target.value)}
          className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
        />
        <p className="text-xs text-gray-400 dark:text-night-400 mt-1.5">
          Prices come back in USD. This flat Naira amount is added on top of the USD-to-NGN
          converted price — but only for services that don't have their own markup set in the
          catalog below. Any service with its own markup uses that instead, independent of this
          default.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {saved && <p className="text-sm text-brand-700 dark:text-brand-400">Settings updated.</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
