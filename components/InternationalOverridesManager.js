"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Star } from "lucide-react";

// Country -> service drill-down for setting per-combo favorite/disabled
// overrides (see public.daisysim_overrides). Mirrors the customer-facing
// InternationalBuyForm's country-then-service picker, and mirrors
// ProductsList's favorite-star + enable/disable pattern for DaisySMS.
export default function InternationalOverridesManager({ countries, overrides }) {
  const router = useRouter();
  const [countryQuery, setCountryQuery] = useState("");
  const [country, setCountry] = useState(null);

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [serviceQuery, setServiceQuery] = useState("");
  const [savingCode, setSavingCode] = useState(null);

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => c.name.toLowerCase().includes(q));
  }, [countries, countryQuery]);

  const overrideMap = useMemo(() => {
    const map = new Map();
    for (const o of overrides) map.set(`${o.country_id}::${o.service_code}`, o);
    return map;
  }, [overrides]);

  const visibleServices = useMemo(() => {
    const q = serviceQuery.trim().toLowerCase();
    const list = q ? services.filter((s) => s.name.toLowerCase().includes(q)) : services;
    if (!country) return list;
    // Favorited combos sort to the top, same as the customer-facing list —
    // lets the admin see immediately what a customer would see first.
    return [...list].sort((a, b) => {
      const aFav = overrideMap.get(`${country.id}::${a.code}`)?.favorite ? 1 : 0;
      const bFav = overrideMap.get(`${country.id}::${b.code}`)?.favorite ? 1 : 0;
      return bFav - aFav;
    });
  }, [services, serviceQuery, overrideMap, country]);

  async function handleSelectCountry(c) {
    setCountry(c);
    setServices([]);
    setServiceQuery("");
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/international/services?countryId=${encodeURIComponent(c.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load services");
      setServices(data.services || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggle(service, field) {
    if (!country) return;
    const key = `${country.id}::${service.code}`;
    const existing = overrideMap.get(key);
    setSavingCode(service.code);
    setError("");
    try {
      const res = await fetch("/api/admin/international/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryId: country.id,
          countryName: country.name,
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
    <div className="grid md:grid-cols-2 gap-6 items-start">
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-2">
          Country
        </div>
        <div className="relative mb-3">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400"
          />
          <input
            type="text"
            value={countryQuery}
            onChange={(e) => setCountryQuery(e.target.value)}
            placeholder="Search countries…"
            className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
          />
        </div>
        <div className="max-h-72 overflow-y-auto space-y-1 border border-gray-100 dark:border-night-700 rounded-lg p-2">
          {filteredCountries.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-night-400 px-2 py-4 text-center">No countries match.</p>
          ) : (
            filteredCountries.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectCountry(c)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
                  country?.id === c.id
                    ? "bg-brand-50 dark:bg-brand-950 text-brand-800 dark:text-brand-300"
                    : "hover:bg-gray-50 dark:hover:bg-night-800"
                }`}
              >
                {c.name}
              </button>
            ))
          )}
        </div>
      </div>

      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-2">
          Services {country ? `in ${country.name}` : ""}
        </div>
        {!country ? (
          <p className="text-sm text-gray-400 dark:text-night-400">Pick a country to manage its services.</p>
        ) : (
          <>
            <div className="relative mb-3">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400"
              />
              <input
                type="text"
                value={serviceQuery}
                onChange={(e) => setServiceQuery(e.target.value)}
                placeholder="Search services…"
                className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
              />
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>}

            {loading ? (
              <p className="text-sm text-gray-400 dark:text-night-400">Loading services…</p>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-50 dark:divide-night-700 border border-gray-100 dark:border-night-700 rounded-lg">
                {visibleServices.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-night-400 px-3 py-6 text-center">
                    No services match.
                  </p>
                ) : (
                  visibleServices.map((s) => {
                    const o = overrideMap.get(`${country.id}::${s.code}`);
                    const isFavorite = Boolean(o?.favorite);
                    const isDisabled = Boolean(o?.disabled);
                    const isSaving = savingCode === s.code;
                    return (
                      <div key={s.code} className="flex items-center justify-between gap-2 px-3 py-2.5">
                        <span
                          className={`text-sm font-medium truncate pr-2 ${
                            isDisabled ? "text-gray-400 dark:text-night-500 line-through" : ""
                          }`}
                        >
                          {s.name}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => toggle(s, "favorite")}
                            title={isFavorite ? "Remove favorite" : "Mark favorite"}
                            className={`p-1.5 rounded-lg transition disabled:opacity-50 ${
                              isFavorite
                                ? "text-amber-500"
                                : "text-gray-300 dark:text-night-600 hover:text-amber-400"
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
            )}
          </>
        )}
      </div>
    </div>
  );
}
