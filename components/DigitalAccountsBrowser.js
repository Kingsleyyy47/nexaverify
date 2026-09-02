"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";

// Category tabs -> product template grid -> checkout. Live stock counts come
// from /api/digital-accounts/templates (computed server-side against
// digital_stock_items, which has no client-facing select policy at all — see
// schema.sql), so the "N pcs" count (and the separate "Sold out" badge next
// to it once that count hits 0) always reflects the real, current count
// rather than something cached on the template row.
//
// The whole card is the tap target — no inline quantity input or Buy Now
// button here anymore (per the business owner's request: no repeating
// "Sold out" on a second control, and no asking for quantity twice). Tapping
// an in-stock card goes straight to its checkout page
// (app/(customer)/digital-accounts/checkout/[templateId]/page.js), which is
// where quantity is actually picked and the purchase happens. A sold-out
// card isn't a link at all — nothing to tap through to.
export default function DigitalAccountsBrowser() {
  const [categories, setCategories] = useState(null);
  const [categoryId, setCategoryId] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    async function loadCategories() {
      setLoadingCategories(true);
      setLoadError("");
      try {
        const res = await fetch("/api/digital-accounts/categories");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load categories.");
        setCategories(data.categories || []);
        if (data.categories?.length) setCategoryId(data.categories[0].id);
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoadingCategories(false);
      }
    }
    loadCategories();
  }, []);

  useEffect(() => {
    if (!categoryId) return;
    async function loadTemplates() {
      setLoadingTemplates(true);
      setLoadError("");
      try {
        const res = await fetch(`/api/digital-accounts/templates?categoryId=${categoryId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load products.");
        setTemplates(data.templates || []);
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoadingTemplates(false);
      }
    }
    loadTemplates();
  }, [categoryId]);

  const activeCategory = useMemo(() => categories?.find((c) => c.id === categoryId), [categories, categoryId]);

  if (loadingCategories) {
    return <p className="text-sm text-gray-400 dark:text-night-400">Loading categories…</p>;
  }

  if (loadError && !categories) {
    return <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>;
  }

  if (!categories || categories.length === 0) {
    return (
      <div className="card card-pad text-sm text-gray-500 dark:text-night-400">
        No products available yet — check back soon.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-5">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryId(c.id)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition ${
              categoryId === c.id
                ? "bg-brand-600 text-white"
                : "bg-gray-100 dark:bg-night-800 text-gray-500 dark:text-night-300 hover:bg-gray-200 dark:hover:bg-night-700"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {activeCategory?.description && (
        <p className="text-sm text-gray-400 dark:text-night-400 mb-4">{activeCategory.description}</p>
      )}

      {loadingTemplates ? (
        <p className="text-sm text-gray-400 dark:text-night-400">Loading products…</p>
      ) : !templates || templates.length === 0 ? (
        <div className="card card-pad text-sm text-gray-500 dark:text-night-400">
          No products in this category yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const outOfStock = t.availableCount <= 0;
            return (
              <div key={t.id} className="card card-pad flex flex-col">
                {/* No product name here on purpose — the description below is
                    the card's only text, per the business owner's request
                    (the category tab above already gives context, and the
                    admin-only name is still what the Order Details page and
                    the admin catalog show). */}
                <div className="flex items-start justify-end gap-2 mb-1">
                  {t.favorite && <Star size={14} fill="currentColor" className="text-amber-400 shrink-0" />}
                </div>
                {t.description && (
                  <p className="text-sm text-gray-600 dark:text-night-300 mb-3 flex-1">{t.description}</p>
                )}
                {/* "X pcs" is always plain, informational text — untouched.
                    The other pill does double duty instead of adding a new
                    control: in stock, it's a real "Buy" button straight into
                    checkout; sold out, it reverts to the same plain, red,
                    non-clickable "Sold out" text as before. */}
                <div className="flex items-center justify-between gap-2">
                  <div className="text-lg font-bold">₦{Number(t.price_ngn).toLocaleString("en-US")}</div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`badge ${outOfStock ? "badge-danger" : "badge-success"}`}>
                      {t.availableCount} pcs
                    </span>
                    {outOfStock ? (
                      <span className="badge badge-danger">Sold out</span>
                    ) : (
                      <Link href={`/digital-accounts/checkout/${t.id}`} className="badge badge-success hover:opacity-80 transition">
                        Buy
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
