"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// `config` comes from admin/us-only/page.js as:
// { enabled, markupAmountNgn, backend, updatedAt }
//
// Three-way selector, not two independent toggles: Off / Getatext / DaisySim.
// A single selected value makes it impossible to end up with both backends
// "on" at once — enabled=false means Off regardless of `backend`; enabled=true
// picks exactly one of the two. In-flight rentals remember which backend
// actually fulfilled them (rentals.us_only_backend) independent of whatever
// this is currently set to, so flipping it never affects an already-placed
// order — see the schema.sql comment on that column.
export default function UsOnlyConfigForm({ config }) {
  const router = useRouter();
  const [mode, setMode] = useState(config.enabled ? (config.backend === "daisysim" ? "daisysim" : "getatext") : "off");
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
        body: JSON.stringify({
          enabled: mode !== "off",
          backend: mode === "daisysim" ? "daisysim" : "getatext",
          markupAmountNgn: Number(markup),
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
        <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
          <span className="font-bold text-sm">US Only</span>
          <div className="flex rounded-lg bg-gray-100 dark:bg-night-800 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode("off")}
              className={`px-2.5 py-1 rounded-md transition ${
                mode === "off"
                  ? "bg-white dark:bg-night-900 text-red-600 dark:text-red-400 shadow-sm"
                  : "text-gray-500 dark:text-night-400"
              }`}
            >
              Off
            </button>
            <button
              type="button"
              onClick={() => setMode("getatext")}
              className={`px-2.5 py-1 rounded-md transition ${
                mode === "getatext"
                  ? "bg-white dark:bg-night-900 text-brand-700 dark:text-brand-400 shadow-sm"
                  : "text-gray-500 dark:text-night-400"
              }`}
            >
              Getatext
            </button>
            <button
              type="button"
              onClick={() => setMode("daisysim")}
              className={`px-2.5 py-1 rounded-md transition ${
                mode === "daisysim"
                  ? "bg-white dark:bg-night-900 text-brand-700 dark:text-brand-400 shadow-sm"
                  : "text-gray-500 dark:text-night-400"
              }`}
            >
              DaisySim
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-night-400">
          Turns the "US Only" product on or off for customers, and picks which of two
          interchangeable providers fulfills it — Getatext or DaisySim's own dedicated USA
          numbers API. Only one can be active at a time. Separate from the regular DaisySMS
          catalog and from "All countries".
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
