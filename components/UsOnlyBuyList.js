"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useCurrency } from "./CurrencyProvider";
import PurchasedNumberDropdown from "./PurchasedNumberDropdown";
import { usePlatformLogos } from "./usePlatformLogos";
import AdaptiveLogo from "./AdaptiveLogo";

// Tap-to-buy widget for the "US Only" provider — mirrors QuickBuyList.js's
// pattern (services list with price passed in already priced, tap a row to
// buy instantly) rather than InternationalBuyForm's country-then-service
// drill-down, since this provider is USA-only and has no price tiers, so
// there's nothing to drill into. `services` come from lib/usOnlyCatalog.js:
// [{ code, name, priceUsd, priceNgn }].
export default function UsOnlyBuyList({ services, title = "US virtual numbers", compact = false }) {
  const router = useRouter();
  const { format } = useCurrency();
  const { logoFor } = usePlatformLogos();
  const [query, setQuery] = useState("");
  const [buyingCode, setBuyingCode] = useState(null);
  const [error, setError] = useState("");
  // Numbers bought THIS session, keyed by service code — rendered as a
  // collapsible dropdown directly under the SPECIFIC row that was tapped,
  // same pattern used by every other buy flow in the app.
  const [purchasedByService, setPurchasedByService] = useState({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name?.toLowerCase().includes(q));
  }, [services, query]);

  async function buy(service) {
    if (buyingCode) return;
    setError("");
    setBuyingCode(service.code);
    try {
      const res = await fetch("/api/us-only/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceCode: service.code,
          serviceName: service.name,
          priceUsd: service.priceUsd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      if (data.rental) setPurchasedByService((prev) => ({ ...prev, [service.code]: data.rental }));
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBuyingCode(null);
    }
  }

  if (services.length === 0) {
    return (
      <div className="card card-pad text-sm text-gray-500 dark:text-night-400">
        No numbers are available right now. Check back soon.
      </div>
    );
  }

  return (
    <div className="card card-pad">
      <h3 className="font-bold text-lg">{title}</h3>
      <p className="text-xs text-gray-400 dark:text-night-400 mt-1 mb-4">
        USA-only numbers. Credits are only used if you receive the SMS code.
      </p>

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search services…"
          className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

      <div className="border border-gray-100 dark:border-night-700 rounded-lg overflow-hidden">
        <div className="flex text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold bg-gray-50 dark:bg-night-950 px-4 py-2 border-b border-gray-100 dark:border-night-700">
          <span className="flex-1">Service</span>
          <span>Price</span>
        </div>
        <div className={`${compact ? "max-h-80" : "max-h-[32rem]"} overflow-y-auto divide-y divide-gray-50 dark:divide-night-700`}>
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-night-400 px-4 py-6 text-center">
              No services match &quot;{query}&quot;.
            </p>
          ) : (
            filtered.map((s) => (
              <Fragment key={s.code}>
                <button
                  type="button"
                  disabled={buyingCode !== null}
                  onClick={() => buy(s)}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-night-800 transition disabled:opacity-50"
                >
                  <AdaptiveLogo logo={logoFor(s.name)} className="w-7 h-7 rounded-lg shrink-0" />
                  <span className="flex-1 min-w-0 pr-3">
                    <span className="block font-semibold truncate dark:text-night-100">{s.name}</span>
                    {s.stock != null && (
                      <span className="block text-xs text-gray-400 dark:text-night-400">{s.stock.toLocaleString("en-US")} pcs left</span>
                    )}
                  </span>
                  <span className="text-brand-700 dark:text-brand-400 font-bold shrink-0">
                    {buyingCode === s.code ? "Purchasing…" : format(s.priceNgn)}
                  </span>
                </button>
                {purchasedByService[s.code] && (
                  <PurchasedNumberDropdown rental={purchasedByService[s.code]} />
                )}
              </Fragment>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
