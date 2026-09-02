"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import ToggleSwitch from "./ToggleSwitch";

// One row in the /admin/social-boost catalog manager. `service` already has
// enabled/favorite/markupNgn merged in by /api/social-boost/services.
export default function SocialBoostServiceRow({ service, usdRate, showCostInNgn }) {
  const [enabled, setEnabled] = useState(service.enabled);
  const [favorite, setFavorite] = useState(service.favorite);
  const [markup, setMarkup] = useState(service.markupNgn ?? 0);
  const [busy, setBusy] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  // Lets an admin drop out of % mode for just this one service without
  // having to re-run the bulk control — switches the row to the same flat
  // ₦ input+Save UI as every other service; nothing is saved until Save is
  // actually pressed.
  const [editingAsFlat, setEditingAsFlat] = useState(false);

  // Bulk actions elsewhere on the page update many rows server-side and then
  // call router.refresh() — rows are keyed by service.service (stable across
  // a refresh), so React reuses these instances instead of remounting them.
  // Re-sync local state whenever the prop actually changes, same reasoning
  // as ProductPriceRow.js.
  useEffect(() => setEnabled(service.enabled), [service.enabled]);
  useEffect(() => setFavorite(service.favorite), [service.favorite]);
  useEffect(() => setMarkup(service.markupNgn ?? 0), [service.markupNgn]);
  useEffect(() => {
    if (service.markupType === "flat") setEditingAsFlat(false);
  }, [service.markupType]);

  // This row's flat ₦ input+Save always writes markup_type: "flat" server
  // -side (see the comment on app/api/admin/social-boost/overrides) — saving
  // it is how an admin opts a service back out of the % markup the bulk
  // control (SocialBoostCatalogManager) may have set.
  async function save(partial) {
    const res = await fetch("/api/admin/social-boost/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: service.service,
        serviceName: service.name,
        enabled,
        favorite,
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
      await save({ enabled: next });
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
      await save({ markupNgn: Number(markup) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // leave the input as-is so the admin can retry
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 md:grid md:grid-cols-[1.6fr_0.7fr_1fr_auto] md:items-center md:gap-4 py-3 border-b border-gray-50 dark:border-night-700 last:border-0">
      <div className="flex items-start gap-1.5 min-w-0">
        <button
          onClick={handleToggleFavorite}
          disabled={favBusy}
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          title={favorite ? "Remove from favorites" : "Add to favorites"}
          className="shrink-0 mt-0.5 text-gray-300 dark:text-night-600 hover:text-amber-400 transition"
        >
          <Star size={16} fill={favorite ? "currentColor" : "none"} className={favorite ? "text-amber-400" : ""} />
        </button>
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">
            #{service.service} — {service.name}
          </div>
          <div className="text-xs text-gray-400 dark:text-night-400 mt-0.5">
            {service.platform} · {service.category} · min {service.min} / max {service.max}
          </div>
        </div>
      </div>

      <div className="text-sm text-gray-500 dark:text-night-300">
        {showCostInNgn && usdRate
          ? `₦${(Number(service.rate) * usdRate).toLocaleString("en-US", { maximumFractionDigits: 2 })}/1000`
          : `$${service.rate}/1000`}
      </div>

      <div>
        {service.markupType === "percent" && !editingAsFlat ? (
          <div className="flex items-center gap-2">
            <span className="badge badge-neutral text-xs shrink-0">
              {service.markupPercent}% markup
              {usdRate && (
                <>
                  {" "}
                  · ≈₦
                  {(
                    Number(service.rate) *
                    usdRate *
                    (Number(service.markupPercent) / 100)
                  ).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  /1000
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => setEditingAsFlat(true)}
              className="text-[11px] text-brand-700 dark:text-brand-400 font-semibold hover:underline"
            >
              Edit as flat ₦
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400 text-sm">₦</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={markup}
                onChange={(e) => setMarkup(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-6 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
              />
            </div>
            <button onClick={handleSaveMarkup} disabled={busy} className="btn-secondary btn-sm shrink-0">
              {saved ? "Saved" : "Save"}
            </button>
          </div>
        )}
      </div>

      <ToggleSwitch checked={enabled} disabled={busy} onChange={handleToggleEnabled} />
    </div>
  );
}
