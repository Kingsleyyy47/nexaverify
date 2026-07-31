"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrency } from "./CurrencyProvider";

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

  const selected = services.find((s) => s.id === serviceId);
  const isLongTerm = duration !== "";

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
      {/* Product grid */}
      <div className="grid sm:grid-cols-2 gap-3">
        {services.map((s) => (
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

      {/* Purchase panel */}
      <div className="card card-pad">
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
          <div className="mt-5 p-4 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-100 dark:border-brand-900 text-sm">
            <div className="font-bold text-brand-800 dark:text-brand-300 mb-1">Number purchased</div>
            <div className="text-brand-900 dark:text-brand-200 font-mono text-base mb-2">
              {result.phone_number}
            </div>
            <a href="/rentals" className="text-brand-700 dark:text-brand-400 font-semibold text-xs">
              Go to Rentals to view the code →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
