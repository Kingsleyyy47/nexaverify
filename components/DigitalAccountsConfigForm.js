"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// `config` comes from admin/digital-accounts/categories/page.js as:
// { customerVisible }
// Single On/Off switch — off (the default) shows every non-admin customer
// "Coming soon" everywhere Digital Accounts appears (nav sidebar, the
// dashboard's quick-links tile, the mobile bottom nav, and /digital-accounts
// itself); admins always see the real thing regardless, so you can keep
// setting up categories/templates/stock here without flipping this on first.
export default function DigitalAccountsConfigForm({ config }) {
  const router = useRouter();
  const [customerVisible, setCustomerVisible] = useState(Boolean(config.customerVisible));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/digital-accounts/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerVisible }),
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
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div className="flex items-center justify-between">
        <div className="pr-4">
          <span className="font-bold text-sm block">Let customers see it</span>
          <p className="text-xs text-gray-400 dark:text-night-400 mt-0.5">
            Off (default): every customer sees "Coming soon" on Digital Accounts. On: the real
            catalog and buy flow, billed from their own wallet. You can keep building categories,
            templates, and stock here regardless of this switch.
          </p>
        </div>
        <div className="flex rounded-lg bg-gray-100 dark:bg-night-800 p-0.5 text-xs font-semibold shrink-0">
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

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {saved && <p className="text-sm text-brand-700 dark:text-brand-400">Settings updated.</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
