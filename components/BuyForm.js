"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useCurrency } from "./CurrencyProvider";
import PurchasedNumberDropdown from "./PurchasedNumberDropdown";

const DURATIONS = [
  { value: "", label: "Short-term (5-15 min, standard rental)" },
  { value: "1D", label: "1 day (long-term)" },
  { value: "7D", label: "7 days (long-term)" },
  { value: "1M", label: "1 month (long-term)" },
];

export default function BuyForm({ services }) {
  const router = useRouter();
  const { format } = useCurrency();
  const [serviceId, setServiceId] = useState(services[0]?.id || "");
  const [duration, setDuration] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [query, setQuery] = useState("");

  const selected = services.find((s) => s.id === serviceId);
  const isLongTerm = duration !== "";

  const filteredServices = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name?.toLowerCase().includes(q));
  }, [services, query]);

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

  return (
    <div className="grid md:grid-cols-2 gap-6 items-start">
      {/* Product grid — shown second on mobile so the purchase panel below
          (order-1 on mobile) doesn't require scrolling past the whole
          product list to reach it. Desktop keeps the original left/right
          order via md:order-none. */}
      <div className="order-2 md:order-none">
        <div className="relative mb-3">
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
          <div className="grid sm:grid-cols-2 gap-3">
            {filteredServices.map((s) => (
              <button
                key={s.id}
                onClick={() => setServiceId(s.id)}
                className={`card card-pad text-left transition ${
                  serviceId === s.id
                    ? "border-brand-500 ring-2 ring-brand-100 dark:ring-brand-900"
                    : "hover:border-brand-300"
                }`}
              >
                <div className="font-bold text-sm mb-1">{s.name}</div>
                <div className="text-brand-700 dark:text-brand-400 font-bold text-lg">
                  {format(s.customer_price)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Purchase panel — first on mobile (see note above), unchanged position on desktop */}
      <div className="order-1 md:order-none card card-pad">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-1">
              Selected product
            </div>
            <div className="font-bold">{selected?.name}</div>
            <div className="text-brand-700 dark:text-brand-400 font-bold text-2xl mt-1">
              {selected ? format(selected.customer_price) : "—"}
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

          <button type="submit" disabled={loading || !selected} className="btn-primary w-full">
            {loading ? "Purchasing…" : `Buy now — ${selected ? format(selected.customer_price) : ""}`}
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
