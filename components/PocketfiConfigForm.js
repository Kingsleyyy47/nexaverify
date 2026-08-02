"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BANKS = [
  { value: "kuda", label: "Kuda" },
  { value: "safehaven", label: "SafeHaven" },
  { value: "paga", label: "Paga" },
  { value: "9psb", label: "9PSB" },
  { value: "palmpay", label: "PalmPay (needs NIN/BVN — not collected here)" },
];

// `config` comes from admin/pocketfi/page.js as:
// { virtualAccountEnabled, virtualAccountBank, updatedAt }
export default function PocketfiConfigForm({ config }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(Boolean(config.virtualAccountEnabled));
  const [bank, setBank] = useState(config.virtualAccountBank || "kuda");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/pocketfi/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ virtualAccountEnabled: enabled, virtualAccountBank: bank }),
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
          <span className="font-bold text-sm">Virtual account top-up</span>
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
          Controls whether /topup issues customers a permanent, dedicated bank account number
          (get-or-create, one per customer). Turning this off doesn't remove account numbers
          already issued — customers who have one keep using it — it only stops new ones from
          being created and hides the flow on /topup.
        </p>
      </div>

      <div>
        <label className="font-bold text-sm block mb-2">Bank for new accounts</label>
        <select
          value={bank}
          onChange={(e) => setBank(e.target.value)}
          className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
        >
          {BANKS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-400 dark:text-night-400 mt-1.5">
          Only affects customers who don't have an account yet — PocketFi has no way to move an
          already-issued account to a different bank, so switching this won't change anyone's
          existing account number.
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
