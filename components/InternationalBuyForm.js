"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useCurrency } from "./CurrencyProvider";
import PurchasedNumberDropdown from "./PurchasedNumberDropdown";

export default function InternationalBuyForm({ countries }) {
  const router = useRouter();
  const { format } = useCurrency();

  const [countryQuery, setCountryQuery] = useState("");
  const [country, setCountry] = useState(null); // { id, name }

  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState("");
  const [serviceQuery, setServiceQuery] = useState("");
  const [service, setService] = useState(null); // { code, name }

  const [tiers, setTiers] = useState([]);
  const [tiersLoading, setTiersLoading] = useState(false);
  const [tiersError, setTiersError] = useState("");
  const [selectedTier, setSelectedTier] = useState(null);

  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState("");
  const [result, setResult] = useState(null);

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => c.name.toLowerCase().includes(q));
  }, [countries, countryQuery]);

  const filteredServices = useMemo(() => {
    const q = serviceQuery.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name.toLowerCase().includes(q));
  }, [services, serviceQuery]);

  async function handleSelectCountry(c) {
    setCountry(c);
    setService(null);
    setTiers([]);
    setSelectedTier(null);
    setResult(null);
    setServices([]);
    setServicesError("");
    setServicesLoading(true);
    try {
      const res = await fetch(`/api/international/services?countryId=${c.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load services");
      setServices(data.services || []);
    } catch (err) {
      setServicesError(err.message);
    } finally {
      setServicesLoading(false);
    }
  }

  async function handleSelectService(s) {
    setService(s);
    setTiers([]);
    setSelectedTier(null);
    setResult(null);
    setTiersError("");
    setTiersLoading(true);
    try {
      const res = await fetch("/api/international/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryId: country.id, serviceCode: s.code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load prices");
      const t = data.tiers || [];
      setTiers(t);
      setSelectedTier(t[0] || null);
    } catch (err) {
      setTiersError(err.message);
    } finally {
      setTiersLoading(false);
    }
  }

  async function handleBuy() {
    if (!country || !service || !selectedTier) return;
    setBuying(true);
    setBuyError("");
    setResult(null);
    try {
      const res = await fetch("/api/international/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryId: country.id,
          countryName: country.name,
          serviceCode: service.code,
          serviceName: service.name,
          priceUsd: selectedTier.price,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");

      setResult(data.rental);
      router.refresh();
    } catch (err) {
      setBuyError(err.message);
    } finally {
      setBuying(false);
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-6 items-start">
      {/* Selection panel — country then service — shown second on mobile so
          the purchase panel (order-1 on mobile) is reachable without
          scrolling, same pattern as BuyForm.js. */}
      <div className="order-2 md:order-none space-y-5">
        <div className="card card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-3">
            1. Country
          </div>
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400" />
            <input
              type="text"
              value={countryQuery}
              onChange={(e) => setCountryQuery(e.target.value)}
              placeholder="Search countries…"
              className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
            />
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {filteredCountries.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelectCountry(c)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
                  country?.id === c.id
                    ? "bg-brand-50 dark:bg-brand-950 text-brand-800 dark:text-brand-300"
                    : "hover:bg-gray-50 dark:hover:bg-night-800"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {country && (
          <div className="card card-pad">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-3">
              2. Service
            </div>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400" />
              <input
                type="text"
                value={serviceQuery}
                onChange={(e) => setServiceQuery(e.target.value)}
                placeholder="Search services…"
                className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
              />
            </div>
            {servicesLoading ? (
              <p className="text-sm text-gray-400 dark:text-night-400">Loading services…</p>
            ) : servicesError ? (
              <p className="text-sm text-red-600">{servicesError}</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredServices.map((s) => (
                  <button
                    key={s.code}
                    onClick={() => handleSelectService(s)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
                      service?.code === s.code
                        ? "bg-brand-50 dark:bg-brand-950 text-brand-800 dark:text-brand-300"
                        : "hover:bg-gray-50 dark:hover:bg-night-800"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Purchase panel */}
      <div className="order-1 md:order-none card card-pad">
        {!country || !service ? (
          <p className="text-sm text-gray-400 dark:text-night-400">
            Pick a country and service to see live pricing.
          </p>
        ) : tiersLoading ? (
          <p className="text-sm text-gray-400 dark:text-night-400">Loading prices…</p>
        ) : tiersError ? (
          <p className="text-sm text-red-600">{tiersError}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-1">
                Selected
              </div>
              <div className="font-bold">
                {service.name} — {country.name}
              </div>
            </div>

            {tiers.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-night-400">
                No numbers available for this combination right now.
              </p>
            ) : (
              <div className="space-y-2">
                {tiers.map((t) => (
                  <button
                    key={t.tier}
                    onClick={() => setSelectedTier(t)}
                    disabled={!t.available}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition ${
                      selectedTier?.tier === t.tier
                        ? "border-brand-500 ring-2 ring-brand-100 dark:ring-brand-900"
                        : "border-gray-200 dark:border-night-600 hover:border-brand-300"
                    } ${!t.available ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span className="text-sm font-semibold">Tier {t.tier}</span>
                    <span className="text-sm text-gray-400 dark:text-night-400">
                      {t.available.toLocaleString("en-US")} pcs left
                    </span>
                    <span className="font-bold text-brand-700 dark:text-brand-400">
                      {format(t.priceNgn)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {buyError && <p className="text-sm text-red-600">{buyError}</p>}

            <button
              onClick={handleBuy}
              disabled={buying || !selectedTier}
              className="btn-primary w-full"
            >
              {buying ? "Purchasing…" : selectedTier ? `Buy now — ${format(selectedTier.priceNgn)}` : "Buy now"}
            </button>
          </div>
        )}

        {result && (
          <div className="mt-5">
            <PurchasedNumberDropdown rental={result} />
          </div>
        )}
      </div>
    </div>
  );
}
