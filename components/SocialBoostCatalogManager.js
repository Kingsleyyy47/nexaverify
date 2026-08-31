"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, ChevronUp, Star } from "lucide-react";
import SocialBoostServiceRow from "./SocialBoostServiceRow";
import ConfirmDialog from "./ConfirmDialog";
import { PLATFORMS } from "@/lib/socialboost-platform";

const RENDER_CAP = 300;

// Loads the live catalog (already merged with overrides + platform by
// /api/social-boost/services — admins get every service, including ones
// they've disabled, so they can be re-enabled here) on demand, since it
// could be thousands of rows unlike DaisySMS's already-synced local table.
export default function SocialBoostCatalogManager() {
  const router = useRouter();
  const [services, setServices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("All");
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const [markupAmount, setMarkupAmount] = useState("");
  const [pendingAction, setPendingAction] = useState(null); // null | "enable" | "disable" | "markup"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/social-boost/services");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the service list.");
      setServices(data.services || []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const platformCounts = useMemo(() => {
    const counts = {};
    for (const s of services || []) counts[s.platform] = (counts[s.platform] || 0) + 1;
    return counts;
  }, [services]);

  const filtered = useMemo(() => {
    if (!services) return [];
    const q = query.trim().toLowerCase();
    return services.filter((s) => {
      if (platform !== "All" && s.platform !== platform) return false;
      if (!q) return true;
      return s.name?.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q) || String(s.service).includes(q);
    });
  }, [services, query, platform]);

  const favorites = useMemo(() => filtered.filter((s) => s.favorite), [filtered]);
  const nonFavorites = useMemo(() => filtered.filter((s) => !s.favorite), [filtered]);
  const capped = nonFavorites.slice(0, RENDER_CAP);

  const markupValue = Number(markupAmount);
  const markupIsValid = markupAmount !== "" && Number.isFinite(markupValue) && markupValue >= 0;

  function asServiceRefs(list) {
    return list.map((s) => ({ serviceId: s.service, serviceName: s.name }));
  }

  async function handleEnableAll() {
    setPendingAction(null);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/social-boost/overrides/enable-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: asServiceRefs(filtered) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not enable services");
      await load();
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisableAll() {
    setPendingAction(null);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/social-boost/overrides/disable-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: asServiceRefs(filtered) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not disable services");
      await load();
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleApplyMarkup() {
    setPendingAction(null);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/social-boost/overrides/markup-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: asServiceRefs(filtered), amount: markupValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update prices");
      setMarkupAmount("");
      await load();
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400 dark:text-night-400">Loading catalog…</p>;
  }

  if (loadError) {
    return (
      <div>
        <p className="text-sm text-red-600 dark:text-red-400 mb-3">{loadError}</p>
        <button onClick={load} className="btn-secondary btn-sm">
          Retry
        </button>
      </div>
    );
  }

  if (!services || services.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-night-400">No services returned by the provider.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {["All", ...PLATFORMS, "Other"].map((p) => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              platform === p
                ? "bg-brand-600 text-white"
                : "bg-gray-100 dark:bg-night-800 text-gray-500 dark:text-night-300 hover:bg-gray-200 dark:hover:bg-night-700"
            }`}
          >
            {p} {platformCounts[p] ? `(${platformCounts[p]})` : p === "All" ? `(${services.length})` : "(0)"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services…"
            className="w-full max-w-xs rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400 text-sm">₦</span>
            <input
              type="number"
              step="0.01"
              value={markupAmount}
              onChange={(e) => setMarkupAmount(e.target.value)}
              placeholder="e.g. 500"
              className="w-32 rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-6 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
            />
          </div>
          <button
            onClick={() => setPendingAction("markup")}
            disabled={busy || !markupIsValid || filtered.length === 0}
            className="btn-secondary btn-sm"
          >
            Markup
          </button>
        </div>

        <button onClick={() => setPendingAction("enable")} disabled={busy || filtered.length === 0} className="btn-secondary btn-sm">
          {busy ? "Working…" : `Enable all (${filtered.length})`}
        </button>
        <button onClick={() => setPendingAction("disable")} disabled={busy || filtered.length === 0} className="btn-secondary btn-sm">
          {busy ? "Working…" : `Disable all (${filtered.length})`}
        </button>

        {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      </div>

      {favorites.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
          <button
            onClick={() => setFavoritesOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-300">
              <Star size={16} fill="currentColor" />
              Favorites ({favorites.length})
            </span>
            {favoritesOpen ? (
              <ChevronUp size={18} className="text-amber-700 dark:text-amber-400" />
            ) : (
              <ChevronDown size={18} className="text-amber-700 dark:text-amber-400" />
            )}
          </button>
          {favoritesOpen && (
            <div className="px-4 pb-2 border-t border-amber-200 dark:border-amber-900">
              {favorites.map((s) => (
                <SocialBoostServiceRow key={s.service} service={s} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="hidden md:grid md:grid-cols-[1.6fr_0.7fr_1fr_auto] gap-4 pb-3 mb-1 border-b border-gray-100 dark:border-night-700 text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold">
        <div>Service</div>
        <div>Rate</div>
        <div>Markup (₦)</div>
        <div>Enabled</div>
      </div>

      {capped.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-night-400 py-4">
          {filtered.length === 0 ? "No services match." : "All matching services are favorited above."}
        </p>
      ) : (
        capped.map((s) => <SocialBoostServiceRow key={s.service} service={s} />)
      )}

      {nonFavorites.length > RENDER_CAP && (
        <p className="text-xs text-gray-400 dark:text-night-400 mt-3">
          Showing first {RENDER_CAP} of {nonFavorites.length} matches — narrow your search or pick a platform tab to see more.
        </p>
      )}

      <ConfirmDialog
        open={pendingAction === "enable"}
        title="Enable all matching services?"
        message={`This turns on all ${filtered.length} service(s) currently shown. Customers will be able to order any of them once "Let customers see it" is on.`}
        confirmLabel="Yes, enable them"
        cancelLabel="Cancel"
        onConfirm={handleEnableAll}
        onCancel={() => setPendingAction(null)}
      />

      <ConfirmDialog
        open={pendingAction === "disable"}
        danger
        title="Disable all matching services?"
        message={`This turns off all ${filtered.length} service(s) currently shown. No one — including admins — will be able to order any of them until re-enabled.`}
        confirmLabel="Yes, disable them"
        cancelLabel="Cancel"
        onConfirm={handleDisableAll}
        onCancel={() => setPendingAction(null)}
      />

      <ConfirmDialog
        open={pendingAction === "markup"}
        title={`Set markup to ₦${markupValue.toLocaleString()} for all matching services?`}
        message={`This sets a flat ₦${markupValue.toLocaleString()} markup (added once per order) on all ${filtered.length} service(s) currently shown — replacing whatever markup was set before on each, not adding on top of it. You can still edit any individual service afterward.`}
        confirmLabel="Yes, apply it"
        cancelLabel="Cancel"
        onConfirm={handleApplyMarkup}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
