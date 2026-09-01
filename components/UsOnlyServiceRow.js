"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import ToggleSwitch from "./ToggleSwitch";
import { formatMoney } from "@/lib/currency";

// One row in the US Only admin catalog manager. `service` already has
// favorite/disabled/markupNgn merged in by UsOnlyOverridesManager — mirrors
// ProductPriceRow.js's layout (DaisySMS's Products page) as closely as this
// provider's always-live pricing allows: instead of a manually-set final
// price, the editable box here is the MARKUP amount (since Getatext's own
// cost is live and re-fetched every load, there's nothing to "set a final
// price" against that wouldn't immediately go stale).
export default function UsOnlyServiceRow({ service, usdRate, showCostInNgn }) {
  const [enabled, setEnabled] = useState(!service.disabled);
  const [favorite, setFavorite] = useState(service.favorite);
  const [markup, setMarkup] = useState(service.markupNgn);
  const [busy, setBusy] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // Bulk actions elsewhere on the page update many rows server-side and then
  // call router.refresh() — rows are keyed by service.code (stable across a
  // refresh), so React reuses these instances instead of remounting them.
  // Re-sync local state whenever the prop actually changes, same reasoning
  // as ProductPriceRow.js.
  useEffect(() => setEnabled(!service.disabled), [service.disabled]);
  useEffect(() => setFavorite(service.favorite), [service.favorite]);
  useEffect(() => setMarkup(service.markupNgn), [service.markupNgn]);

  async function save(partial) {
    const res = await fetch("/api/admin/us-only/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceCode: service.code,
        serviceName: service.name,
        favorite,
        disabled: !enabled,
        markupNgn: markup,
        ...partial,
      }),
    });
    if (!res.ok) throw new Error();
    return res.json();
  }

  async function handleToggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    setBusy(true);
    try {
      await save({ disabled: !next });
    } catch {
      setEnabled(!next);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    setFavBusy(true);
    try {
      await save({ favorite: next });
    } catch {
      setFavorite(!next);
    } finally {
      setFavBusy(false);
    }
  }

  async function handleSaveMarkup() {
    setBusy(true);
    setSaved(false);
    try {
      await save({ markupNgn: markup === "" ? null : Number(markup) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // leave the input as-is so the admin can retry
    } finally {
      setBusy(false);
    }
  }

  const costDisplay =
    showCostInNgn && usdRate
      ? formatMoney(Number(service.price || 0) * usdRate, "NGN")
      : `$${Number(service.price || 0).toFixed(2)}`;

  return (
    <div className="py-4 border-b border-gray-50 dark:border-night-700 last:border-0">
      <div className="flex flex-col gap-3 md:grid md:grid-cols-[1.4fr_1fr_1.2fr_auto] md:items-center md:gap-4">
        <div className="flex items-center justify-between md:block">
          <div className="flex items-start gap-1.5">
            <button
              onClick={handleToggleFavorite}
              disabled={favBusy}
              aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
              title={favorite ? "Remove from favorites" : "Add to favorites"}
              className="shrink-0 mt-0.5 text-gray-300 dark:text-night-600 hover:text-amber-400 transition"
            >
              <Star size={16} fill={favorite ? "currentColor" : "none"} className={favorite ? "text-amber-400" : ""} />
            </button>
            <div>
              <div className="font-semibold text-sm">{service.name}</div>
              <div className="text-xs text-gray-400 dark:text-night-400 mt-0.5">
                {service.stock != null ? `${service.stock} available` : "—"}
              </div>
            </div>
          </div>
          <div className="md:hidden">
            <ToggleSwitch checked={enabled} disabled={busy} onChange={handleToggleEnabled} />
          </div>
        </div>

        <div className="flex items-center justify-between md:block">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold md:hidden">
            Cost
          </div>
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold hidden md:block">
            Cost
          </div>
          <div className="text-sm font-semibold">{costDisplay}</div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400 text-sm">₦</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={markup ?? ""}
              onChange={(e) => setMarkup(e.target.value)}
              placeholder="Markup"
              className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-6 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
            />
          </div>
          <button onClick={handleSaveMarkup} disabled={busy} className="btn-secondary btn-sm shrink-0">
            {saved ? "Saved" : "Save"}
          </button>
        </div>

        <div className="hidden md:block">
          <ToggleSwitch checked={enabled} disabled={busy} onChange={handleToggleEnabled} />
        </div>
      </div>
    </div>
  );
}
