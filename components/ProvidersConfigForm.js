"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function ToggleRow({ title, description, detailHref, detailLabel, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-gray-100 dark:border-night-800 last:border-0">
      <div className="min-w-0">
        <div className="font-bold text-sm">{title}</div>
        <p className="text-xs text-gray-400 dark:text-night-400 mt-0.5 max-w-md">{description}</p>
        {detailHref && (
          <Link
            href={detailHref}
            className="text-xs font-semibold text-brand-700 dark:text-brand-400 mt-1.5 inline-block"
          >
            {detailLabel} →
          </Link>
        )}
      </div>
      <div className="flex rounded-lg bg-gray-100 dark:bg-night-800 p-0.5 text-xs font-semibold shrink-0">
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-2.5 py-1 rounded-md transition ${
            !checked
              ? "bg-white dark:bg-night-900 text-red-600 dark:text-red-400 shadow-sm"
              : "text-gray-500 dark:text-night-400"
          }`}
        >
          Off
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-2.5 py-1 rounded-md transition ${
            checked
              ? "bg-white dark:bg-night-900 text-brand-700 dark:text-brand-400 shadow-sm"
              : "text-gray-500 dark:text-night-400"
          }`}
        >
          On
        </button>
      </div>
    </div>
  );
}

// `config` comes from admin/providers/page.js as:
// { daisysmsEnabled, daisysimEnabled, usOnlyEnabled, pocketfiVirtualAccountEnabled }
export default function ProvidersConfigForm({ config }) {
  const router = useRouter();
  const [daisysmsEnabled, setDaisysmsEnabled] = useState(config.daisysmsEnabled);
  const [daisysimEnabled, setDaisysimEnabled] = useState(config.daisysimEnabled);
  const [usOnlyEnabled, setUsOnlyEnabled] = useState(config.usOnlyEnabled);
  const [pocketfiVirtualAccountEnabled, setPocketfiVirtualAccountEnabled] = useState(
    config.pocketfiVirtualAccountEnabled
  );
  const [istarEnabled, setIstarEnabled] = useState(config.istarEnabled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/providers/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daisysmsEnabled,
          daisysimEnabled,
          usOnlyEnabled,
          pocketfiVirtualAccountEnabled,
          istarEnabled,
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
    <form onSubmit={handleSubmit} className="max-w-xl">
      <ToggleRow
        title="US Only (DaisySim USA)"
        description="A separate USA-only numbers provider — /products/us-only, the dashboard quick-buy list, and the sidebar link. Off hides all of it from customers and blocks purchases server-side."
        detailHref="/admin/us-only"
        detailLabel="Manage markup & catalog"
        checked={usOnlyEnabled}
        onChange={setUsOnlyEnabled}
      />
      <ToggleRow
        title="USA & Canada (DaisySMS)"
        description="The main product catalog — /products, the dashboard quick-buy list, and the sidebar link. Off hides all of it from customers and blocks purchases server-side."
        detailHref="/admin/products"
        detailLabel="Manage products & pricing"
        checked={daisysmsEnabled}
        onChange={setDaisysmsEnabled}
      />
      <ToggleRow
        title="All countries (DaisySim)"
        description="International Numbers — /products/international and its sidebar link. Off hides the whole section from customers and blocks purchases server-side."
        detailHref="/admin/international"
        detailLabel="Manage markup & catalog"
        checked={daisysimEnabled}
        onChange={setDaisysimEnabled}
      />
      <ToggleRow
        title="Wallet top-up (PocketFi)"
        description="The permanent dedicated-account-number funding flow on /topup. Off hides it from customers; already-issued account numbers stay valid but new ones can't be created."
        detailHref="/admin/pocketfi"
        detailLabel="Manage bank & settings"
        checked={pocketfiVirtualAccountEnabled}
        onChange={setPocketfiVirtualAccountEnabled}
      />
      <ToggleRow
        title="Telegram Premium & Stars (iStar)"
        description="Unlike the other toggles, this only controls whether an admin can place a real test order — customer visibility is a separate switch, off by default, on the Telegram Premium settings page."
        detailHref="/admin/telegram-premium"
        detailLabel="Manage price & wallet"
        checked={istarEnabled}
        onChange={setIstarEnabled}
      />

      {error && <p className="text-sm text-red-600 dark:text-red-400 mt-4">{error}</p>}
      {saved && <p className="text-sm text-brand-700 dark:text-brand-400 mt-4">Settings updated.</p>}

      <button type="submit" disabled={loading} className="btn-primary mt-5">
        {loading ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
