"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Star, ArrowLeft } from "lucide-react";
import { useCurrency } from "./CurrencyProvider";
import { PLATFORMS } from "@/lib/socialboost-platform";

// This app has no global `.input` utility class (checked — every other form
// in the codebase spells this Tailwind combo out inline, e.g.
// ProductPriceRow.js/UsOnlyOverridesManager.js), so it's defined once here
// instead of repeating it at every input below.
const INPUT_CLASS =
  "w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900";
const SEARCH_INPUT_CLASS =
  "w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900";

// Shared by both the customer-facing /products/social-boost page (gated
// there to admins-only until social_boost_config.customer_visible flips on)
// and, effectively, the admin's own test flow — an admin visiting that same
// page IS the test flow, exactly like Telegram Premium's TelegramGiftBuyForm.
//
// Browsing is platform-first (Instagram/TikTok/Facebook/Twitter tabs) rather
// than a single search-everything dropdown — the panel's catalog can run
// into the thousands, so picking a platform narrows it down before a search
// box narrows it further. Picking a specific service then reveals the order
// form (link, quantity, and a live total-cost preview) for just that one —
// deliberately no runs/interval fields, per the business owner's request.
export default function SocialBoostBuyForm({ isAdminView, initialOrders = [] }) {
  const { format, rateMap } = useCurrency();
  const [services, setServices] = useState(null);
  const [servicesError, setServicesError] = useState("");
  const [loadingServices, setLoadingServices] = useState(true);
  const [platformTab, setPlatformTab] = useState(PLATFORMS[0]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState(initialOrders);
  const [busyOrderId, setBusyOrderId] = useState(null);

  useEffect(() => {
    (async () => {
      setLoadingServices(true);
      setServicesError("");
      try {
        const res = await fetch("/api/social-boost/services");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load services");
        setServices(data.services || []);
      } catch (err) {
        setServicesError(err.message);
      } finally {
        setLoadingServices(false);
      }
    })();
  }, []);

  const hasOtherPlatform = useMemo(() => (services || []).some((s) => s.platform === "Other"), [services]);
  const tabs = hasOtherPlatform ? [...PLATFORMS, "Other"] : PLATFORMS;

  const platformCounts = useMemo(() => {
    const counts = {};
    for (const s of services || []) counts[s.platform] = (counts[s.platform] || 0) + 1;
    return counts;
  }, [services]);

  const tabServices = useMemo(() => {
    if (!services) return [];
    const q = search.trim().toLowerCase();
    return services
      .filter((s) => s.platform === platformTab)
      .filter((s) => !q || s.name?.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q))
      .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
  }, [services, platformTab, search]);

  const selectedService = useMemo(
    () => (services || []).find((s) => String(s.service) === String(selectedId)) || null,
    [services, selectedId]
  );

  // Mirrors the exact server-side formula in app/api/social-boost/orders —
  // rate is USD per 1000 units, converted to NGN at the same admin-set USD
  // rate used everywhere else in the app, plus this service's own flat
  // markup override. Purely a live preview; the actual charge is always
  // recomputed server-side at purchase time.
  const usdRate = rateMap?.USD;
  const estimatedTotalNgn = useMemo(() => {
    const qty = Number(quantity);
    if (!selectedService || !usdRate || !Number.isFinite(qty) || qty <= 0) return null;
    const costUsd = (Number(selectedService.rate) / 1000) * qty;
    const markupNgn = Number(selectedService.markupNgn || 0);
    return Math.max(0, Math.round((costUsd * usdRate + markupNgn) * 100) / 100);
  }, [selectedService, quantity, usdRate]);

  function selectService(service) {
    setSelectedId(service.service);
    setQuantity("");
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!selectedService) {
      setError("Pick a service first");
      return;
    }
    setPlacing(true);
    try {
      const res = await fetch("/api/social-boost/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: selectedService.service,
          link,
          quantity: Number(quantity),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not place order");
      setOrders((prev) => [data.order, ...prev]);
      setLink("");
      setQuantity("");
      setSelectedId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  }

  async function refreshOrder(orderId) {
    setBusyOrderId(orderId);
    try {
      const res = await fetch(`/api/social-boost/orders/${orderId}/refresh`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.order) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? data.order : o)));
      }
    } finally {
      setBusyOrderId(null);
    }
  }

  async function cancelOrder(orderId) {
    setBusyOrderId(orderId);
    try {
      const res = await fetch(`/api/social-boost/orders/${orderId}/cancel`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.order) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? data.order : o)));
      } else if (data.error) {
        setError(data.error);
      }
    } finally {
      setBusyOrderId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card card-pad">
        {loadingServices ? (
          <p className="text-sm text-gray-400 dark:text-night-400">Loading products…</p>
        ) : servicesError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{servicesError}</p>
        ) : selectedService ? (
          <div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-night-400 hover:text-brand-700 dark:hover:text-brand-400 mb-4"
            >
              <ArrowLeft size={14} /> Back to {platformTab}
            </button>

            <h3 className="font-bold text-[15px] mb-1">{selectedService.name}</h3>
            <div className="text-xs text-gray-500 dark:text-night-300 bg-gray-50 dark:bg-night-800 rounded-lg p-2.5 mb-4">
              Min {selectedService.min} · Max {selectedService.max} per order
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-night-300 block mb-1">Link</label>
                <input
                  type="text"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://…"
                  className={INPUT_CLASS}
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-night-300 block mb-1">Quantity</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min={selectedService.min || 1}
                  max={selectedService.max || undefined}
                  className={INPUT_CLASS}
                  required
                />
              </div>

              <div className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-night-800 px-3.5 py-2.5">
                <span className="text-xs font-semibold text-gray-500 dark:text-night-300">Total cost</span>
                <span className="font-bold text-sm">
                  {estimatedTotalNgn != null ? format(estimatedTotalNgn) : "—"}
                </span>
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <button type="submit" disabled={placing} className="btn-primary">
                {placing ? "Placing order…" : "Place order"}
              </button>

              {isAdminView && (
                <p className="text-[11px] text-gray-400 dark:text-night-400">
                  This debits your own wallet balance, exactly like a real customer purchase would.
                </p>
              )}
            </form>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-1.5 mb-4">
              {tabs.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatformTab(p)}
                  className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition ${
                    platformTab === p
                      ? "bg-brand-600 text-white"
                      : "bg-gray-100 dark:bg-night-800 text-gray-500 dark:text-night-300 hover:bg-gray-200 dark:hover:bg-night-700"
                  }`}
                >
                  {p} {platformCounts[p] ? `(${platformCounts[p]})` : ""}
                </button>
              ))}
            </div>

            <div className="relative mb-4 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${platformTab} products…`}
                className={SEARCH_INPUT_CLASS}
              />
            </div>

            {tabServices.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-night-400 py-4">
                No {platformTab} products {search ? "match your search" : "available right now"}.
              </p>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-night-800 border border-gray-100 dark:border-night-700 rounded-lg overflow-hidden max-h-[28rem] overflow-y-auto">
                {tabServices.map((s) => (
                  <button
                    key={s.service}
                    type="button"
                    onClick={() => selectService(s)}
                    className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-gray-50 dark:hover:bg-night-800 transition"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {s.favorite && <Star size={13} fill="currentColor" className="text-amber-400 shrink-0" />}
                        <span className="font-semibold text-sm truncate">{s.name}</span>
                      </div>
                      <div className="text-xs text-gray-400 dark:text-night-400 mt-0.5 truncate">{s.category}</div>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-night-300 shrink-0">
                      ${s.rate}/1000 · min {s.min}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-3">Recent orders</h3>
        {orders.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-night-400">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 border-b border-gray-100 dark:border-night-700">
                  <th className="pb-2 pr-3 font-bold">Order</th>
                  <th className="pb-2 pr-3 font-bold">Service</th>
                  <th className="pb-2 pr-3 font-bold">Qty</th>
                  <th className="pb-2 pr-3 font-bold">Status</th>
                  <th className="pb-2 pr-3 font-bold">Remains</th>
                  <th className="pb-2 pr-3 font-bold">Charged</th>
                  <th className="pb-2 font-bold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-night-800">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2 pr-3 font-mono text-xs">#{o.provider_order_id}</td>
                    <td className="py-2 pr-3 text-gray-600 dark:text-night-300 max-w-[180px] truncate">
                      {o.service_name || o.service_id}
                    </td>
                    <td className="py-2 pr-3">{o.quantity}</td>
                    <td className="py-2 pr-3">
                      <span className="badge badge-neutral text-[10px]">{o.status}</span>
                      {o.cancel_requested_at && (
                        <span className="badge badge-warning text-[10px] ml-1">Cancel requested</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{o.remains ?? "—"}</td>
                    <td className="py-2 pr-3">{o.price_ngn != null ? format(o.price_ngn) : "—"}</td>
                    <td className="py-2 whitespace-nowrap">
                      <button
                        type="button"
                        disabled={busyOrderId === o.id}
                        onClick={() => refreshOrder(o.id)}
                        className="btn-secondary btn-sm mr-1.5"
                      >
                        Refresh
                      </button>
                      {!o.cancel_requested_at && (
                        <button
                          type="button"
                          disabled={busyOrderId === o.id}
                          onClick={() => cancelOrder(o.id)}
                          className="btn-secondary btn-sm"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
