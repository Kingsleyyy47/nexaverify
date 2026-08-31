"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function ToggleRow({ title, description, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-gray-100 dark:border-night-800 last:border-0">
      <div className="min-w-0">
        <div className="font-bold text-sm">{title}</div>
        <p className="text-xs text-gray-400 dark:text-night-400 mt-0.5 max-w-md">{description}</p>
      </div>
      <div className="flex rounded-lg bg-gray-100 dark:bg-night-800 p-0.5 text-xs font-semibold shrink-0">
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-2.5 py-1 rounded-md transition ${
            !checked ? "bg-white dark:bg-night-900 text-red-600 dark:text-red-400 shadow-sm" : "text-gray-500 dark:text-night-400"
          }`}
        >
          Off
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-2.5 py-1 rounded-md transition ${
            checked ? "bg-white dark:bg-night-900 text-brand-700 dark:text-brand-400 shadow-sm" : "text-gray-500 dark:text-night-400"
          }`}
        >
          On
        </button>
      </div>
    </div>
  );
}

// `config` is { enabled, customerVisible } from app/admin/social-boost/page.js
export default function SocialBoostConfigForm({ config }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(config.enabled);
  const [customerVisible, setCustomerVisible] = useState(config.customerVisible);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/social-boost/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, customerVisible }),
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
    <form onSubmit={handleSubmit} className="max-w-xl">
      <ToggleRow
        title="Enabled"
        description="Your own test-ordering access at /products/social-boost — always available to admins regardless of the switch below."
        checked={enabled}
        onChange={setEnabled}
      />
      <ToggleRow
        title="Let customers see it"
        description='A separate, off-by-default switch — flip this on once you\'re happy with testing to open the real buy flow to everyone else. Until then, non-admins see "Coming soon".'
        checked={customerVisible}
        onChange={setCustomerVisible}
      />

      {error && <p className="text-sm text-red-600 dark:text-red-400 mt-4">{error}</p>}
      {saved && <p className="text-sm text-brand-700 dark:text-brand-400 mt-4">Settings updated.</p>}

      <button type="submit" disabled={loading} className="btn-primary mt-5">
        {loading ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
