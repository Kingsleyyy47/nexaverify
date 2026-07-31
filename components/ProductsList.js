"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import ProductPriceRow from "./ProductPriceRow";
import ConfirmDialog from "./ConfirmDialog";

// Client-side filter over the already-fetched services list — there are only
// a few hundred rows (DaisySMS's whole service catalog), so no extra round
// trip to the DB is needed just to search by name/shortcode.
export default function ProductsList({ services, usdRate }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showCostInNgn, setShowCostInNgn] = useState(false);
  const [markupAmount, setMarkupAmount] = useState("");
  const [pendingAction, setPendingAction] = useState(null); // null | "enable" | "disable" | "markup"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter(
      (s) => s.name?.toLowerCase().includes(q) || s.id?.toLowerCase().includes(q)
    );
  }, [services, query]);

  const markupValue = Number(markupAmount);
  const markupIsValid = markupAmount !== "" && Number.isFinite(markupValue);

  async function handleEnableAll() {
    setPendingAction(null);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/services/enable-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceIds: filtered.map((s) => s.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not enable products");
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
      const res = await fetch("/api/admin/services/disable-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceIds: filtered.map((s) => s.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not disable products");
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
      const res = await fetch("/api/admin/services/markup-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceIds: filtered.map((s) => s.id), amount: markupValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update prices");
      setMarkupAmount("");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (services.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-night-400">
        No products synced yet. Click &quot;Sync from DaisySMS&quot; to pull the live list and
        costs.
      </p>
    );
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
          Show DaisySMS cost in {showCostInNgn ? "$" : "₦"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            className="w-full max-w-xs rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400 text-sm">
              ₦
            </span>
            <input
              type="number"
              step="0.01"
              value={markupAmount}
              onChange={(e) => setMarkupAmount(e.target.value)}
              placeholder="e.g. 1000"
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

        <button
          onClick={() => setPendingAction("enable")}
          disabled={busy || filtered.length === 0}
          className="btn-secondary btn-sm"
        >
          {busy
            ? "Working…"
            : query
            ? `Enable all (${filtered.length} shown)`
            : `Enable all (${filtered.length})`}
        </button>

        <button
          onClick={() => setPendingAction("disable")}
          disabled={busy || filtered.length === 0}
          className="btn-secondary btn-sm"
        >
          {busy
            ? "Working…"
            : query
            ? `Disable all (${filtered.length} shown)`
            : `Disable all (${filtered.length})`}
        </button>

        {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      </div>

      <div className="grid grid-cols-[1.4fr_1fr_1.2fr_auto] gap-4 pb-3 mb-1 border-b border-gray-100 dark:border-night-700 text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold">
        <div>Product</div>
        <div>Cost</div>
        <div>Customer price (₦)</div>
        <div>Enabled</div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-night-400 py-4">
          No products match &quot;{query}&quot;.
        </p>
      ) : (
        filtered.map((s) => (
          <ProductPriceRow key={s.id} service={s} usdRate={usdRate} showCostInNgn={showCostInNgn} />
        ))
      )}

      <ConfirmDialog
        open={pendingAction === "enable"}
        title="Enable all matching products?"
        message={
          query
            ? `This turns on all ${filtered.length} product(s) currently shown for "${query}". Customers will be able to buy any of them that already have a price set.`
            : `This turns on all ${filtered.length} products in the catalog. Customers will be able to buy any of them that already have a price set.`
        }
        confirmLabel="Yes, enable them"
        cancelLabel="Cancel"
        onConfirm={handleEnableAll}
        onCancel={() => setPendingAction(null)}
      />

      <ConfirmDialog
        open={pendingAction === "disable"}
        danger
        title="Disable all matching products?"
        message={
          query
            ? `This turns off all ${filtered.length} product(s) currently shown for "${query}". Customers won't be able to buy any of them until re-enabled.`
            : `This turns off all ${filtered.length} products in the catalog. Customers won't be able to buy any of them until re-enabled.`
        }
        confirmLabel="Yes, disable them"
        cancelLabel="Cancel"
        onConfirm={handleDisableAll}
        onCancel={() => setPendingAction(null)}
      />

      <ConfirmDialog
        open={pendingAction === "markup"}
        title={`Set price to DaisySMS cost + ₦${markupValue.toLocaleString()} margin?`}
        message={
          query
            ? `This recalculates the customer price of all ${filtered.length} product(s) currently shown for "${query}" as DaisySMS's cost (converted to ₦) plus a ₦${markupValue.toLocaleString()} margin — replacing whatever price was set before, not adding on top of it.`
            : `This recalculates the customer price of all ${filtered.length} products in the catalog as DaisySMS's cost (converted to ₦) plus a ₦${markupValue.toLocaleString()} margin — replacing whatever price was set before, not adding on top of it.`
        }
        confirmLabel="Yes, apply it"
        cancelLabel="Cancel"
        onConfirm={handleApplyMarkup}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
