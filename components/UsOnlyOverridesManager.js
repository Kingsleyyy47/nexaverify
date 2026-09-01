"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, ChevronUp, Star } from "lucide-react";
import UsOnlyServiceRow from "./UsOnlyServiceRow";
import ConfirmDialog from "./ConfirmDialog";

// US Only's admin catalog manager — rebuilt to match /admin/products'
// layout and controls exactly (favorites section, per-row markup+Save,
// bulk Enable/Disable/Markup scoped to the current search, "Show cost in
// ₦" toggle) rather than the old plain favorite/disable-only list. The one
// real difference: DaisySMS stores a manually-set final `customer_price`
// per product (recomputed only on demand via sync), while Getatext's cost is
// always live — so there's no equivalent "auto-markup on future syncs"
// checkbox here, and the editable box per row is the MARKUP amount, not a
// final price (see UsOnlyServiceRow.js and the pricing fallback described in
// schema.sql's daisysim_usa_overrides.markup_ngn comment).
export default function UsOnlyOverridesManager({ services, overrides, usdRate, markupAmountNgn }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showCostInNgn, setShowCostInNgn] = useState(false);
  const [markupAmount, setMarkupAmount] = useState("");
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const [pendingAction, setPendingAction] = useState(null); // null | "enable" | "disable" | "markup"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const overrideMap = useMemo(() => {
    const map = new Map();
    for (const o of overrides) map.set(o.service_code, o);
    return map;
  }, [overrides]);

  // Merges the live catalog with each service's saved override — favorite,
  // disabled, and the markup actually in effect right now (its own override
  // if it has one, otherwise the global default), so the row's input always
  // shows the real number a customer is currently being charged from.
  const merged = useMemo(() => {
    return services.map((s) => {
      const o = overrideMap.get(s.code);
      const effectiveMarkup = o?.markup_ngn != null ? Number(o.markup_ngn) : Number(markupAmountNgn || 0);
      return {
        code: s.code,
        name: s.name,
        price: s.price,
        stock: s.stock,
        favorite: Boolean(o?.favorite),
        disabled: Boolean(o?.disabled),
        markupNgn: effectiveMarkup,
      };
    });
  }, [services, overrideMap, markupAmountNgn]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter((s) => s.name?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q));
  }, [merged, query]);

  const favorites = useMemo(() => filtered.filter((s) => s.favorite), [filtered]);
  const nonFavorites = useMemo(() => filtered.filter((s) => !s.favorite), [filtered]);

  const markupValue = Number(markupAmount);
  const markupIsValid = markupAmount !== "" && Number.isFinite(markupValue);

  function asServiceRefs(list) {
    return list.map((s) => ({ serviceCode: s.code, serviceName: s.name }));
  }

  async function handleEnableAll() {
    setPendingAction(null);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/us-only/overrides/enable-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: asServiceRefs(filtered) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not enable services");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisableAll() {
    setPendingAction(null);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/us-only/overrides/disable-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: asServiceRefs(filtered) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not disable services");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleApplyMarkup() {
    setPendingAction(null);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/us-only/overrides/markup-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: asServiceRefs(filtered), amount: markupValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update markup");
      setMarkupAmount("");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (services.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-night-400">No services returned by the provider.</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setShowCostInNgn((v) => !v)}
          disabled={!usdRate}
          title={!usdRate ? "Set a USD rate in Currency rates first" : ""}
          className="btn-secondary btn-sm"
        >
          Show cost in {showCostInNgn ? "$" : "₦"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services…"
            className="w-full max-w-xs rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400 text-sm">₦</span>
            <input
              type="number"
              step="0.01"
              value={markupAmount}
              onChange={(e) => setMarkupAmount(e.target.value)}
              placeholder="e.g. 700"
              className="w-32 rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-6 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
            />
          </div>
          <button
            onClick={() => setPendingAction("markup")}
            disabled={busy || !markupIsValid || filtered.length === 0}
            className="btn-secondary btn-sm"
          >
            Markup
          </button>
        </div>

        <button onClick={() => setPendingAction("enable")} disabled={busy || filtered.length === 0} className="btn-secondary btn-sm">
          {busy ? "Working…" : `Enable all (${filtered.length})`}
        </button>
        <button onClick={() => setPendingAction("disable")} disabled={busy || filtered.length === 0} className="btn-secondary btn-sm">
          {busy ? "Working…" : `Disable all (${filtered.length})`}
        </button>

        {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      </div>

      {favorites.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
          <button
            onClick={() => setFavoritesOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-300">
              <Star size={16} fill="currentColor" />
              Favorites ({favorites.length})
            </span>
            {favoritesOpen ? (
              <ChevronUp size={18} className="text-amber-700 dark:text-amber-400" />
            ) : (
              <ChevronDown size={18} className="text-amber-700 dark:text-amber-400" />
            )}
          </button>
          {favoritesOpen && (
            <div className="px-4 pb-2 border-t border-amber-200 dark:border-amber-900">
              {favorites.map((s) => (
                <UsOnlyServiceRow key={s.code} service={s} usdRate={usdRate} showCostInNgn={showCostInNgn} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="hidden md:grid grid-cols-[1.4fr_1fr_1.2fr_auto] gap-4 pb-3 mb-1 border-b border-gray-100 dark:border-night-700 text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold">
        <div>Service</div>
        <div>Cost</div>
        <div>Markup (₦)</div>
        <div>Enabled</div>
      </div>

      {nonFavorites.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-night-400 py-4">
          {filtered.length === 0 ? "No services match." : "All matching services are favorited above."}
        </p>
      ) : (
        nonFavorites.map((s) => <UsOnlyServiceRow key={s.code} service={s} usdRate={usdRate} showCostInNgn={showCostInNgn} />)
      )}

      <ConfirmDialog
        open={pendingAction === "enable"}
        title="Enable all matching services?"
        message={`This turns on all ${filtered.length} service(s) currently shown. Customers will be able to order any of them.`}
        confirmLabel="Yes, enable them"
        cancelLabel="Cancel"
        onConfirm={handleEnableAll}
        onCancel={() => setPendingAction(null)}
      />

      <ConfirmDialog
        open={pendingAction === "disable"}
        danger
        title="Disable all matching services?"
        message={`This turns off all ${filtered.length} service(s) currently shown. No one will be able to order any of them until re-enabled.`}
        confirmLabel="Yes, disable them"
        cancelLabel="Cancel"
        onConfirm={handleDisableAll}
        onCancel={() => setPendingAction(null)}
      />

      <ConfirmDialog
        open={pendingAction === "markup"}
        title={`Set markup to ₦${markupValue.toLocaleString("en-US")} for all matching services?`}
        message={`This sets a flat ₦${markupValue.toLocaleString("en-US")} markup (added on top of Getatext's live cost) on all ${filtered.length} service(s) currently shown — replacing whatever markup was in effect before on each (including the global default), not adding on top of it. You can still edit any individual service afterward.`}
        confirmLabel="Yes, apply it"
        cancelLabel="Cancel"
        onConfirm={handleApplyMarkup}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
