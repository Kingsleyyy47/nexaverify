"use client";

import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import AdaptiveLogo from "./AdaptiveLogo";

// Lets an admin rearrange the order categories appear in on the
// customer-facing Logs page (components/DigitalAccountsBrowser.js — both
// its category dropdown and its "All" view's stacked sections) and the
// dashboard's embedded copy of that same browser. Both read
// digital_categories in (sort_order, created_at) order (see
// app/api/digital-accounts/categories/route.js), and this page is the only
// place sort_order ever gets written (see
// app/api/admin/digital-accounts/categories/reorder/route.js).
//
// Up/down arrows rather than drag-and-drop — no drag library in this
// project, and a plain move-one-step control is simpler to get right and
// use correctly on mobile than wiring up drag events from scratch. Each
// click saves immediately (no separate "Save order" step) so the admin
// always sees exactly what's live, and a failed save reverts the local
// reorder rather than leaving the on-screen list lying about what's saved.
export default function CategoryShuffle() {
  const [categories, setCategories] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [saveError, setSaveError] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/digital-accounts/categories");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load categories.");
      setCategories(data.categories || []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function persistOrder(nextOrder) {
    setSaveError("");
    try {
      const res = await fetch("/api/admin/digital-accounts/categories/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: nextOrder.map((c) => c.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the new order.");
      return true;
    } catch (err) {
      setSaveError(err.message);
      return false;
    }
  }

  async function move(index, direction) {
    const targetIndex = index + direction;
    if (!categories || targetIndex < 0 || targetIndex >= categories.length) return;

    const previous = categories;
    const next = categories.slice();
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];

    setSavingId(previous[index].id);
    setCategories(next); // optimistic — reverted below if the save fails
    const ok = await persistOrder(next);
    if (!ok) setCategories(previous);
    setSavingId(null);
  }

  if (loading) {
    return <p className="text-sm text-gray-400 dark:text-night-400">Loading categories…</p>;
  }
  if (loadError) {
    return <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>;
  }
  if (!categories || categories.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-night-400">
        No categories yet — create one under Categories first.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-gray-400 dark:text-night-400 mb-4">
        This is the order customers see categories in on the Logs page and the dashboard — top of this list
        shows first. Use the arrows to rearrange; changes save immediately.
      </p>
      {saveError && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{saveError}</p>}
      <div className="space-y-2">
        {categories.map((c, idx) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-gray-100 dark:border-night-700"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs font-bold text-gray-400 dark:text-night-500 w-5 shrink-0 text-center">
                {idx + 1}
              </span>
              {c.logo_url ? (
                <AdaptiveLogo
                  logo={{ logoUrl: c.logo_url, logoUrlDark: c.logo_url_dark }}
                  className="w-9 h-9 rounded-lg shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-lg shrink-0 bg-gray-100 dark:bg-night-800" />
              )}
              <div className="min-w-0">
                <div className="font-bold text-sm truncate">{c.name}</div>
                <div className="text-xs text-gray-400 dark:text-night-400">
                  {c.templateCount} product {c.templateCount === 1 ? "group" : "groups"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => move(idx, -1)}
                disabled={idx === 0 || savingId === c.id}
                aria-label={`Move ${c.name} up`}
                className="btn-secondary btn-sm px-2 disabled:opacity-40"
              >
                <ArrowUp size={14} />
              </button>
              <button
                onClick={() => move(idx, 1)}
                disabled={idx === categories.length - 1 || savingId === c.id}
                aria-label={`Move ${c.name} down`}
                className="btn-secondary btn-sm px-2 disabled:opacity-40"
              >
                <ArrowDown size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
