"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import ToggleSwitch from "./ToggleSwitch";
import { formatMoney } from "@/lib/currency";

export default function ProductPriceRow({ service, usdRate, showCostInNgn }) {
  const [enabled, setEnabled] = useState(service.enabled);
  const [price, setPrice] = useState(service.customer_price ?? "");
  const [favorite, setFavorite] = useState(service.favorite);
  const [autoMarkup, setAutoMarkup] = useState(service.auto_markup);
  const [margin, setMargin] = useState(service.markup_amount ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [autoError, setAutoError] = useState("");

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

  useEffect(() => {
    setFavorite(service.favorite);
  }, [service.favorite]);

  useEffect(() => {
    setAutoMarkup(service.auto_markup);
  }, [service.auto_markup]);

  useEffect(() => {
    setMargin(service.markup_amount ?? "");
  }, [service.markup_amount]);

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

  async function handleToggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    setFavBusy(true);
    try {
      const res = await fetch("/api/admin/services/set-favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: service.id, favorite: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setFavorite(!next);
    } finally {
      setFavBusy(false);
    }
  }

  // Saves the margin and/or flips Auto on/off together — Auto can't be
  // turned on without a margin ever having been saved (the route enforces
  // this), since there'd be nothing for a future sync to apply.
  async function handleSaveAuto(nextAutoMarkup) {
    setAutoBusy(true);
    setAutoSaved(false);
    setAutoError("");
    try {
      const res = await fetch("/api/admin/services/set-auto-markup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          autoMarkup: nextAutoMarkup,
          markupAmount: margin === "" ? undefined : Number(margin),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      setAutoMarkup(nextAutoMarkup);
      setAutoSaved(true);
      setTimeout(() => setAutoSaved(false), 2000);
    } catch (err) {
      setAutoError(err.message);
    } finally {
      setAutoBusy(false);
    }
  }

  const costDisplay =
    showCostInNgn && usdRate
      ? formatMoney(Number(service.last_price || 0) * usdRate, "NGN")
      : `$${Number(service.last_price || 0).toFixed(2)}`;

  return (
    <div className="py-4 border-b border-gray-50 dark:border-night-700 last:border-0">
      {/* Stacked card on mobile (the old 4-column grid squeezed the price
          input down to a sliver too narrow to see what you were typing) —
          becomes the original row-based grid at md+ where there's enough
          width for it. */}
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
                {service.last_count != null ? `${service.last_count} available` : "Not synced yet"}
              </div>
            </div>
          </div>
          {/* Enabled toggle sits up here on mobile, next to the name — its
              md:grid column further down is emptied out via md:hidden so it
              doesn't render twice. */}
          <div className="md:hidden">
            <ToggleSwitch checked={enabled} disabled={busy} onChange={handleToggle} />
          </div>
        </div>

        <div className="flex items-center justify-between md:block">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold md:hidden">
            DaisySMS cost
          </div>
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold hidden md:block">
            DaisySMS cost
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
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Set price"
              className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-6 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
            />
          </div>
          <button onClick={handleSavePrice} disabled={busy} className="btn-secondary btn-sm shrink-0">
            {saved ? "Saved" : "Save"}
          </button>
        </div>

        <div className="hidden md:block">
          <ToggleSwitch checked={enabled} disabled={busy} onChange={handleToggle} />
        </div>
      </div>

      {/* Auto-markup: keep this product's price recalculated automatically
          (DaisySMS cost + margin) on every future sync, instead of managing
          it by hand above. Full-width row under everything, same on mobile
          and desktop. */}
      <div className="flex flex-wrap items-center gap-2 mt-3 pl-0 md:pl-0">
        <ToggleSwitch
          checked={Boolean(autoMarkup)}
          disabled={autoBusy}
          onChange={() => handleSaveAuto(!autoMarkup)}
        />
        <span className="text-xs font-semibold text-gray-500 dark:text-night-400">Auto-markup</span>
        <div className="relative w-28">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400 text-xs">₦</span>
          <input
            type="number"
            step="0.01"
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            placeholder="Margin"
            className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-6 pr-2 py-1.5 text-xs outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
          />
        </div>
        <button
          onClick={() => handleSaveAuto(autoMarkup)}
          disabled={autoBusy}
          className="btn-secondary btn-sm"
        >
          {autoSaved ? "Saved" : "Save margin"}
        </button>
        {autoError && <span className="text-xs text-red-600 dark:text-red-400">{autoError}</span>}
      </div>
    </div>
  );
}
