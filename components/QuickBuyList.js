"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useCurrency } from "./CurrencyProvider";
import PurchasedNumberDropdown from "./PurchasedNumberDropdown";

// Tap-to-buy widget for the dashboard — unlike BuyForm (used on /products,
// which has a separate select-then-confirm panel plus a long-term duration
// picker) this purchases the standard short-term rental the instant a row is
// tapped. No duration option here on purpose — anyone who wants a long-term
// number still goes through /products.
export default function QuickBuyList({ services }) {
  const router = useRouter();
  const { format } = useCurrency();
  const [query, setQuery] = useState("");
  const [buyingId, setBuyingId] = useState(null);
  const [error, setError] = useState("");
  // Numbers bought THIS session, keyed by service id — rendered as a
  // collapsible dropdown directly under the SPECIFIC row that was tapped
  // (not just appended below the whole list), same pattern used by every
  // other buy flow in the app. Only the latest purchase per service is kept.
  const [purchasedByService, setPurchasedByService] = useState({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name?.toLowerCase().includes(q));
  }, [services, query]);

  async function buy(service) {
    if (buyingId) return;
    setError("");
    setBuyingId(service.id);
    try {
      const res = await fetch("/api/rentals/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: service.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      if (data.rental) setPurchasedByService((prev) => ({ ...prev, [service.id]: data.rental }));
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBuyingId(null);
    }
  }

  if (services.length === 0) {
    return (
      <div className="card card-pad text-sm text-gray-500 dark:text-night-400">
        No products are available for purchase right now. Check back soon.
      </div>
    );
  }

  return (
    <div className="card card-pad">
      <h3 className="font-bold text-lg">Phone Verifications</h3>
      <p className="text-xs text-gray-400 dark:text-night-400 mt-1 mb-4">
        Rent a phone for 20 minutes. Credits are only used if you receive the SMS code.
      </p>

      <div className="relative mb-3">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400"
        />
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
        <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-night-700">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-night-400 px-4 py-6 text-center">
              No services match &quot;{query}&quot;.
            </p>
          ) : (
            filtered.map((s) => (
              <Fragment key={s.id}>
                <button
                  type="button"
                  disabled={buyingId !== null}
                  onClick={() => buy(s)}
                  className="w-full flex items-center px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-night-800 transition disabled:opacity-50"
                >
                  <span className="flex-1 font-semibold truncate pr-3 dark:text-night-100">{s.name}</span>
                  <span className="text-brand-700 dark:text-brand-400 font-bold shrink-0">
                    {buyingId === s.id ? "Purchasing…" : format(s.customer_price)}
                  </span>
                </button>
                {purchasedByService[s.id] && (
                  <PurchasedNumberDropdown rental={purchasedByService[s.id]} />
                )}
              </Fragment>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
