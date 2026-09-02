"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Star, ArrowLeft, Instagram, Facebook, Twitter, Music2, LayoutGrid } from "lucide-react";
import { useCurrency } from "./CurrencyProvider";
import { PLATFORMS } from "@/lib/socialboost-platform";
import { usePlatformLogos } from "./usePlatformLogos";
import AdaptiveLogo from "./AdaptiveLogo";

// One icon per platform tile on the entry screen below — falls back to a
// generic grid icon for "Other" (services that don't keyword-match any named
// platform — see lib/socialboost-platform.js).
const PLATFORM_ICONS = {
  Instagram,
  TikTok: Music2,
  Facebook,
  Twitter,
  Other: LayoutGrid,
};

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
  const { logoFor } = usePlatformLogos();
  const [services, setServices] = useState(null);
  const [servicesError, setServicesError] = useState("");
  const [loadingServices, setLoadingServices] = useState(true);
  // null = the entry screen below: one tile per platform ("Facebook — 10
  // available", etc.) instead of a live product list. Tapping a tile is what
  // sets this and reveals that platform's full product list — the tab bar
  // that used to sit above the list on every load is gone, replaced by this
  // dedicated "pick a platform first" screen per the business owner's request.
  const [platformTab, setPlatformTab] = useState(null);
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
        const res = await fetch("/api/social-boost/services", { cache: "no-store" });
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

  // What the list row shows before a service is even selected — this used to
  // be the raw provider $rate with no markup applied at all, which is why the
  // markup an admin sets (flat or %) never appeared to the customer until
  // after they picked a service and typed a quantity. Flat markup is really a
  // one-time per-order fee rather than a per-unit price, but showing
  // "cost + flat markup, per 1000" here still gives an honest, non-zero
  // preview of what they'll actually be charged, consistent with the ₦/1000
  // convention used everywhere else (admin catalog's own Rate column, the
  // selected-service Total cost box).
  function markedUpRatePer1000(s) {
    if (!usdRate) return null;
    const costNgn = (Number(s.rate) || 0) * usdRate;
    if (s.markupType === "percent") {
      const pct = Number(s.markupPercent || 0);
      return costNgn * (1 + pct / 100);
    }
    return costNgn + Number(s.markupNgn || 0);
  }

  const selectedService = useMemo(
    () => (services || []).find((s) => String(s.service) === String(selectedId)) || null,
    [services, selectedId]
  );

  // Mirrors the exact server-side formula in app/api/social-boost/orders —
  // rate is USD per 1000 units, converted to NGN at the same admin-set USD
  // rate used everywhere else in the app, plus this service's own markup
  // override — either a flat amount added once, or a % of this order's own
  // cost (see schema.sql's social_boost_overrides.markup_type comment).
  // Purely a live preview; the actual charge is always recomputed
  // server-side at purchase time.
  const usdRate = rateMap?.USD;
  const estimatedTotalNgn = useMemo(() => {
    const qty = Number(quantity);
    if (!selectedService || !usdRate || !Number.isFinite(qty) || qty <= 0) return null;
    const costUsd = (Number(selectedService.rate) / 1000) * qty;
    const costNgn = costUsd * usdRate;
    if (selectedService.markupType === "percent") {
      const pct = Number(selectedService.markupPercent || 0);
      return Math.max(0, Math.round(costNgn * (1 + pct / 100) * 100) / 100);
    }
    const markupNgn = Number(selectedService.markupNgn || 0);
    return Math.max(0, Math.round((costNgn + markupNgn) * 100) / 100);
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

            <div className="flex items-center gap-2 mb-1">
              <AdaptiveLogo logo={logoFor(selectedService.name)} className="w-6 h-6 rounded shrink-0" />
              <h3 className="font-bold text-[15px]">{selectedService.name}</h3>
            </div>
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
        ) : platformTab === null ? (
          // Entry screen — one tile per platform, each showing how many
          // enabled products are behind it. Tapping a tile is the only way
          // into that platform's product list below.
          <div>
            <h3 className="font-bold text-[15px] mb-1">Social Boost</h3>
            <p className="text-xs text-gray-400 dark:text-night-400 mb-4">
              Pick a platform to see its available products.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {tabs.map((p) => {
                const Icon = PLATFORM_ICONS[p] || LayoutGrid;
                const count = platformCounts[p] || 0;
                // An admin-uploaded logo (see /admin/platform-logos) takes
                // priority over the built-in lucide icon — falls back to the
                // icon so this tile never renders empty for a platform no
                // one has added a logo for yet.
                const logo = logoFor(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatformTab(p)}
                    disabled={count === 0}
                    className="card card-pad flex flex-col items-center justify-center gap-2 text-center hover:border-brand-300 dark:hover:border-brand-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {logo ? (
                      <AdaptiveLogo logo={logo} className="w-7 h-7 rounded-lg" />
                    ) : (
                      <Icon size={22} className="text-brand-600 dark:text-brand-400" />
                    )}
                    <span className="font-semibold text-sm">{p}</span>
                    <span className="text-xs text-gray-400 dark:text-night-400">
                      {count} available
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => {
                setPlatformTab(null);
                setSearch("");
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-night-400 hover:text-brand-700 dark:hover:text-brand-400 mb-4"
            >
              <ArrowLeft size={14} /> Back to platforms
            </button>

            <h3 className="font-bold text-[15px] mb-4">
              {platformTab} <span className="text-gray-400 dark:text-night-400 font-normal">· {platformCounts[platformTab] || 0} available</span>
            </h3>

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
                    className="w-full flex flex-col items-stretch gap-2 px-3.5 py-3 text-left hover:bg-gray-50 dark:hover:bg-night-800 transition sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <AdaptiveLogo logo={logoFor(s.name)} className="w-7 h-7 rounded-lg shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {s.favorite && <Star size={13} fill="currentColor" className="text-amber-400 shrink-0" />}
                          <span className="block font-semibold text-sm whitespace-normal break-words sm:truncate">{s.name}</span>
                        </div>
                        <div className="text-xs text-gray-400 dark:text-night-400 mt-0.5 whitespace-normal break-words sm:truncate">
                          {s.category}
                        </div>
                      </div>
                    </div>
                    <div className="pl-9 text-xs font-semibold text-brand-700 dark:text-brand-400 shrink-0 sm:pl-0 sm:text-right sm:text-gray-500 sm:dark:text-night-300">
                      {usdRate ? `${format(markedUpRatePer1000(s))}/1000` : `$${s.rate}/1000`}
                      <span className="hidden sm:inline"> · min {s.min}</span>
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
