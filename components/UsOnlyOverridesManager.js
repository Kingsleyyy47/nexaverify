"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Star } from "lucide-react";

// Flat favorite/disabled override list for the "US Only" catalog — no
// country picker needed (unlike InternationalOverridesManager) since this
// provider is USA-only, so the whole service list is passed in up front.
export default function UsOnlyOverridesManager({ services, overrides, usdRate, markupAmountNgn }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [savingCode, setSavingCode] = useState(null);
  const [error, setError] = useState("");
  const [showCostInNgn, setShowCostInNgn] = useState(false);

  // Same formula as lib/getatext.js#computeNgnPrice (the one actually used
  // to charge customers at purchase time, in app/api/us-only/buy/route.js) —
  // duplicated here in plain JS rather than imported, since that file is
  // "server-only" and this is a Client Component. Unchanged from when this
  // product was backed by DaisySim's server7 API: cost (USD) × your USD
  // rate, plus your flat ₦ markup.
  function computeNgnPrice(usdPrice) {
    const ngn = Number(usdPrice || 0) * Number(usdRate || 0) + Number(markupAmountNgn || 0);
    return Math.max(0, Math.round(ngn * 100) / 100);
  }

  const overrideMap = useMemo(() => {
    const map = new Map();
    for (const o of overrides) map.set(o.service_code, o);
    return map;
  }, [overrides]);

  const visibleServices = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? services.filter((s) => s.name.toLowerCase().includes(q)) : services;
    return [...list].sort((a, b) => {
      const aFav = overrideMap.get(a.code)?.favorite ? 1 : 0;
      const bFav = overrideMap.get(b.code)?.favorite ? 1 : 0;
      return bFav - aFav;
    });
  }, [services, query, overrideMap]);

  async function toggle(service, field) {
    const existing = overrideMap.get(service.code);
    setSavingCode(service.code);
    setError("");
    try {
      const res = await fetch("/api/admin/us-only/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceCode: service.code,
          serviceName: service.name,
          favorite: field === "favorite" ? !existing?.favorite : Boolean(existing?.favorite),
          disabled: field === "disabled" ? !existing?.disabled : Boolean(existing?.disabled),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCode(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services…"
            className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowCostInNgn((v) => !v)}
          disabled={!usdRate}
          title={!usdRate ? "Set a USD rate in Currency rates first" : ""}
          className="btn-secondary btn-sm ml-3 shrink-0"
        >
          Show cost in {showCostInNgn ? "$" : "₦"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>}

      <div className="max-h-96 overflow-y-auto divide-y divide-gray-50 dark:divide-night-700 border border-gray-100 dark:border-night-700 rounded-lg">
        {visibleServices.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-night-400 px-3 py-6 text-center">No services match.</p>
        ) : (
          visibleServices.map((s) => {
            const o = overrideMap.get(s.code);
            const isFavorite = Boolean(o?.favorite);
            const isDisabled = Boolean(o?.disabled);
            const isSaving = savingCode === s.code;
            return (
              <div key={s.code} className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0 pr-2">
                  <span
                    className={`text-sm font-medium truncate block ${
                      isDisabled ? "text-gray-400 dark:text-night-500 line-through" : ""
                    }`}
                  >
                    {s.name}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-night-400">
                    {showCostInNgn && usdRate ? (
                      <>
                        Cost ₦{(Number(s.price || 0) * usdRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        {" · "}Customer pays ₦{computeNgnPrice(s.price).toLocaleString()}
                      </>
                    ) : (
                      <>Cost ${Number(s.price || 0).toFixed(2)}</>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => toggle(s, "favorite")}
                    title={isFavorite ? "Remove favorite" : "Mark favorite"}
                    className={`p-1.5 rounded-lg transition disabled:opacity-50 ${
                      isFavorite ? "text-amber-500" : "text-gray-300 dark:text-night-600 hover:text-amber-400"
                    }`}
                  >
                    <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => toggle(s, "disabled")}
                    className={`btn-secondary btn-sm disabled:opacity-50 ${
                      isDisabled ? "text-red-600 dark:text-red-400" : ""
                    }`}
                  >
                    {isSaving ? "…" : isDisabled ? "Disabled" : "Enabled"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
