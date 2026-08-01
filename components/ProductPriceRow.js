"use client";

import { useEffect, useState } from "react";
import ToggleSwitch from "./ToggleSwitch";
import { formatMoney } from "@/lib/currency";

export default function ProductPriceRow({ service, usdRate, showCostInNgn }) {
  const [enabled, setEnabled] = useState(service.enabled);
  const [price, setPrice] = useState(service.customer_price ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // Bulk actions elsewhere on the page ("Enable all", "Markup") update many
  // rows server-side and then call router.refresh(). Because rows are keyed
  // by service.id (unchanged across a refresh), React reuses these existing
  // component instances instead of remounting them — so useState's initial
  // value above only applies once, on first mount, and silently goes stale
  // after any bulk update. Re-sync local state whenever the prop actually
  // changes so the toggle/price shown always matches the database.
  useEffect(() => {
    setEnabled(service.enabled);
  }, [service.enabled]);

  useEffect(() => {
    setPrice(service.customer_price ?? "");
  }, [service.customer_price]);

  async function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/services/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: service.id, enabled: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setEnabled(!next);
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePrice() {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/services/set-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: service.id, customerPrice: Number(price) }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // leave the input as-is so the admin can retry
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-[1.4fr_1fr_1.2fr_auto] items-center gap-4 py-4 border-b border-gray-50 dark:border-night-700 last:border-0">
      <div>
        <div className="font-semibold text-sm">{service.name}</div>
        <div className="text-xs text-gray-400 dark:text-night-400 mt-0.5">
          {service.last_count != null ? `${service.last_count} available` : "Not synced yet"}
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold">
          DaisySMS cost
        </div>
        <div className="text-sm font-semibold">
          {showCostInNgn && usdRate
            ? formatMoney(Number(service.last_price || 0) * usdRate, "NGN")
            : `$${Number(service.last_price || 0).toFixed(2)}`}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400 text-sm">₦</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Set price"
            className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-6 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
          />
        </div>
        <button onClick={handleSavePrice} disabled={busy} className="btn-secondary btn-sm">
          {saved ? "Saved" : "Save"}
        </button>
      </div>

      <ToggleSwitch checked={enabled} disabled={busy} onChange={handleToggle} />
    </div>
  );
}
