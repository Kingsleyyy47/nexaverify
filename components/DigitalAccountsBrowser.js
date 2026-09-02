"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Star, ChevronRight, Search } from "lucide-react";
import AdaptiveLogo from "./AdaptiveLogo";

const ALL = "all";

// Category picker -> product template grid -> checkout. Live stock counts
// come from /api/digital-accounts/templates (computed server-side against
// digital_stock_items, which has no client-facing select policy at all — see
// schema.sql), so the "N pcs" count (and the separate "Sold out" badge next
// to it once that count hits 0) always reflects the real, current count
// rather than something cached on the template row.
//
// Categories were originally a row of pill buttons — with more than a
// handful of categories that row wraps into a wall of buttons with no clear
// structure (per the business owner's screenshot). Replaced with an "All"
// button (the default view — everything across every category at once) plus
// a dropdown for narrowing to one specific category, same "all vs. one"
// pattern as Social Boost's platform tiles, just as a dropdown instead of
// tiles since there can be many more categories here than platforms.
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
  const [categoryId, setCategoryId] = useState(ALL);
  const [templates, setTemplates] = useState(null);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadError, setLoadError] = useState("");
  // Searches the currently visible products (all categories, or just the
  // selected one) by description — there's no product "name" shown to
  // customers here (see the comment below on the card itself), so
  // description is the only text there is to match against. Cleared
  // whenever the category selection changes, same as every other search box
  // in the app that resets per-tab.
  const [query, setQuery] = useState("");

  useEffect(() => {
    async function loadCategories() {
      setLoadingCategories(true);
      setLoadError("");
      try {
        const res = await fetch("/api/digital-accounts/categories");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load categories.");
        setCategories(data.categories || []);
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoadingCategories(false);
      }
    }
    loadCategories();
  }, []);

  useEffect(() => {
    async function loadTemplates() {
      setLoadingTemplates(true);
      setLoadError("");
      try {
        const qs = categoryId === ALL ? "" : `?categoryId=${categoryId}`;
        const res = await fetch(`/api/digital-accounts/templates${qs}`);
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

  const activeCategory = useMemo(
    () => (categoryId === ALL ? null : categories?.find((c) => c.id === categoryId)),
    [categories, categoryId]
  );

  // Looked up per-template in the "All" view so each card can still show its
  // own category's logo/name even though there's no single selected category
  // to fall back on — see the card's logo + category-name badge below.
  const categoryById = useMemo(() => {
    const map = {};
    for (const c of categories || []) map[c.id] = c;
    return map;
  }, [categories]);

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.description?.toLowerCase().includes(q));
  }, [templates, query]);

  function selectCategory(id) {
    setCategoryId(id);
    setQuery("");
  }

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
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <button
          onClick={() => selectCategory(ALL)}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition shrink-0 ${
            categoryId === ALL
              ? "bg-brand-600 text-white"
              : "bg-gray-100 dark:bg-night-800 text-gray-500 dark:text-night-300 hover:bg-gray-200 dark:hover:bg-night-700"
          }`}
        >
          All
        </button>

        <select
          value={categoryId === ALL ? "" : categoryId}
          onChange={(e) => selectCategory(e.target.value || ALL)}
          className="rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3 py-1.5 text-sm font-semibold outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900 max-w-[16rem]"
        >
          <option value="" disabled>
            Choose a category…
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {activeCategory?.description && (
        <p className="text-sm text-gray-400 dark:text-night-400 mb-4">{activeCategory.description}</p>
      )}

      {templates && templates.length > 0 && (
        <div className="relative mb-4 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
          />
        </div>
      )}

      {loadingTemplates ? (
        <p className="text-sm text-gray-400 dark:text-night-400">Loading products…</p>
      ) : !templates || templates.length === 0 ? (
        <div className="card card-pad text-sm text-gray-500 dark:text-night-400">
          {categoryId === ALL ? "No products available yet." : "No products in this category yet."}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="card card-pad text-sm text-gray-500 dark:text-night-400">
          No products match &quot;{query}&quot;.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((t) => {
            const outOfStock = t.availableCount <= 0;
            // In the "All" view there's no single selected category to fall
            // back on, so each card looks up its OWN category by the
            // template's category_id instead — same logo/description source
            // (CategoryManager.js), just resolved per-card here.
            const cardCategory = categoryId === ALL ? categoryById[t.category_id] : activeCategory;
            return (
              <div key={t.id} className="card card-pad flex items-center gap-3">
                {/* Logo sits on the left, full card height, matching the
                    reference layout — one logo per category (set at
                    Categories, see CategoryManager.js), so it's the same
                    image across every card under it, not per-product. */}
                {cardCategory?.logoUrl ? (
                  <AdaptiveLogo
                    logo={{ logoUrl: cardCategory.logoUrl, logoUrlDark: cardCategory.logoUrlDark }}
                    className="w-14 h-14 rounded-xl shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl shrink-0 bg-gray-100 dark:bg-night-800" />
                )}

                <div className="flex-1 min-w-0">
                  {/* No product name here on purpose — the description is
                      the card's only text, per the business owner's request
                      (the category picker above already gives context in
                      single-category view, and the admin-only name is still
                      what the Order Details page and the admin catalog
                      show). In the "All" view, the category name is shown as
                      a small label above the description instead, since
                      there's no active category tab giving that context. */}
                  {categoryId === ALL && cardCategory?.name && (
                    <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-0.5">
                      {cardCategory.name}
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    {t.description && (
                      <p className="text-sm text-gray-600 dark:text-night-300 line-clamp-2">{t.description}</p>
                    )}
                    {t.favorite && <Star size={14} fill="currentColor" className="text-amber-400 shrink-0 mt-0.5" />}
                  </div>

                  {/* "X pcs" is always plain, informational text — untouched.
                      The right-hand pill does double duty instead of adding a
                      new control: in stock, it's a real "Buy" button straight
                      into checkout; sold out, it reverts to the same plain,
                      red, non-clickable "Sold out" text as before. */}
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`badge ${outOfStock ? "badge-danger" : "badge-success"}`}>
                        {t.availableCount} pcs
                      </span>
                      <span className="badge badge-neutral">₦{Number(t.price_ngn).toLocaleString("en-US")}</span>
                    </div>
                    {outOfStock ? (
                      <span className="badge badge-danger shrink-0">Sold out</span>
                    ) : (
                      <Link
                        href={`/digital-accounts/checkout/${t.id}`}
                        className="badge badge-success shrink-0 flex items-center gap-0.5 hover:opacity-80 transition"
                      >
                        Buy <ChevronRight size={12} />
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
