"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { useCurrency } from "./CurrencyProvider";
import PurchasedNumberDropdown from "./PurchasedNumberDropdown";
import { usePlatformLogos } from "./usePlatformLogos";
import AdaptiveLogo from "./AdaptiveLogo";

const DURATIONS = [
  { value: "", label: "Short-term (5-15 min, standard rental)" },
  { value: "1D", label: "1 day (long-term)" },
  { value: "7D", label: "7 days (long-term)" },
  { value: "1M", label: "1 month (long-term)" },
];

// /products (DaisySMS). Tapping a product tile used to reveal a permanently
// visible "Selected product" panel sitting beside the grid at all times, even
// before anything was picked — per the business owner's request, that panel
// is now a dedicated checkout step instead: the grid is the only thing shown
// at first, and tapping a tile replaces it with the checkout panel (duration
// + Buy now), with a "Back to products" link to return. Same tile-then-
// checkout pattern as SocialBoostBuyForm's platform tiles and the Digital
// Accounts card -> checkout page flow, just without a separate route since
// this purchase is instant (no quantity/description step needed).
export default function BuyForm({ services }) {
  const router = useRouter();
  const { format } = useCurrency();
  const { logoFor } = usePlatformLogos();
  const [serviceId, setServiceId] = useState(null);
  const [duration, setDuration] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [query, setQuery] = useState("");

  const selected = services.find((s) => s.id === serviceId) || null;

  const filteredServices = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name?.toLowerCase().includes(q));
  }, [services, query]);

  function selectService(service) {
    setServiceId(service.id);
    setDuration("");
    setError("");
    setResult(null);
  }

  function backToProducts() {
    setServiceId(null);
    setError("");
    setResult(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch("/api/rentals/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, duration: duration || undefined }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Purchase failed");

      setResult(data.rental);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (services.length === 0) {
    return (
      <div className="card card-pad text-sm text-gray-500 dark:text-night-400">
        No products are available for purchase right now. Check back soon.
      </div>
    );
  }

  if (selected) {
    return (
      <div className="max-w-md">
        <button
          type="button"
          onClick={backToProducts}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-night-400 hover:text-brand-700 dark:hover:text-brand-400 mb-4"
        >
          <ArrowLeft size={14} /> Back to products
        </button>

        <div className="card card-pad">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-start gap-3">
              <AdaptiveLogo logo={logoFor(selected.name)} className="w-10 h-10 rounded-lg shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-1">
                  Selected product
                </div>
                <div className="font-bold">{selected.name}</div>
                <div className="text-brand-700 dark:text-brand-400 font-bold text-2xl mt-1">
                  {format(selected.customer_price)}
                </div>
                {selected.last_count != null && (
                  <div className="text-xs text-gray-400 dark:text-night-400 mt-1">
                    {selected.last_count.toLocaleString("en-US")} pcs left
                  </div>
                )}
              </div>
            </div>

            <div className="field">
              <label htmlFor="duration">Rental duration</label>
              <select id="duration" value={duration} onChange={(e) => setDuration(e.target.value)}>
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <span className="hint">
                Long-term numbers stay on the Rentals page for repeated use. You&apos;ll need to
                receive one message within the short-term window to activate the long-term hold.
              </span>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Purchasing…" : `Buy now — ${format(selected.customer_price)}`}
            </button>
          </form>

          {result && (
            <div className="mt-5">
              <PurchasedNumberDropdown rental={result} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative mb-3 max-w-sm">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
        />
      </div>

      {filteredServices.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-night-400 py-2">
          No products match &quot;{query}&quot;.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredServices.map((s) => (
            <button
              key={s.id}
              onClick={() => selectService(s)}
              className="card card-pad text-left transition hover:border-brand-300 flex items-start gap-3"
            >
              <AdaptiveLogo logo={logoFor(s.name)} className="w-8 h-8 rounded-lg shrink-0" />
              <div className="min-w-0">
                <div className="font-bold text-sm mb-1">{s.name}</div>
                <div className="text-brand-700 dark:text-brand-400 font-bold text-lg">
                  {format(s.customer_price)}
                </div>
                {s.last_count != null && (
                  <div className="text-xs text-gray-400 dark:text-night-400 mt-0.5">
                    {s.last_count.toLocaleString("en-US")} pcs left
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
