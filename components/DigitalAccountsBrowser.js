"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CategoryBanner, ProductCard } from "./DigitalAccountCard";

const ALL = "all";
// The All view's single banner isn't tied to any real category (it mixes
// every category's products together — see the comment above the render
// branch below), so it's a plain display-only stand-in rather than a row
// from digital_categories. CategoryBanner only needs id/name off it.
const POPULAR_BANNER = { id: "popular-logs", name: "Popular Logs" };

// Category picker -> product rows -> checkout. Live stock counts come from
// /api/digital-accounts/templates (computed server-side against
// digital_stock_items, which has no client-facing select policy at all — see
// schema.sql), so the "N pcs" count (and the separate "Sold out" badge next
// to it once that count hits 0) always reflects the real, current count
// rather than something cached on the template row.
//
// Categories were originally a row of pill buttons — with more than a
// handful of categories that row wraps into a wall of buttons with no clear
// structure (per the business owner's screenshot). Replaced with an "All"
// button (the default view) plus a dropdown for narrowing to one specific
// category, same "all vs. one" pattern as Social Boost's platform tiles,
// just as a dropdown instead of tiles since there can be many more
// categories here than platforms.
//
// The "All" view itself (per the business owner's reference screenshots) is
// one single generic "Popular Logs" banner followed by every category's
// products together in one flat grid — not separated into a section per
// category. Each product card still shows its own category's logo (via the
// `logo` prop) so it stays identifiable, and its FULL description (never
// truncated) without repeating the category name as text.
//
// Products render as a 2-column grid of cards (per a later "Marketplace"
// reference screenshot) — icon, description, then pcs/price/Buy. No inline
// quantity input or Buy Now button on the card itself (per the business
// owner's request: no repeating "Sold out" on a second control, and no
// asking for quantity twice). Tapping Buy on an in-stock card goes straight
// to its checkout page
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

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.description?.toLowerCase().includes(q));
  }, [templates, query]);

  // All view only: each ProductCard still needs its own category's logo
  // even though the products are no longer grouped/sectioned by category —
  // this is just a lookup table for that per-card icon.
  const categoryById = useMemo(() => {
    const map = {};
    for (const c of categories || []) map[c.id] = c;
    return map;
  }, [categories]);

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
      ) : categoryId === ALL ? (
        // All view: one generic banner, then every category's products
        // together in a single flat grid — matching the reference layout.
        <div>
          <CategoryBanner category={POPULAR_BANNER} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredTemplates.map((t) => (
              <ProductCard key={t.id} template={t} logo={categoryById[t.category_id]} />
            ))}
          </div>
        </div>
      ) : (
        // Single-category view: the full, uncapped grid for that category —
        // same colored banner + card grid as a section below, just without
        // the "See More" action (already viewing everything).
        <div>
          <CategoryBanner category={activeCategory} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredTemplates.map((t) => (
              <ProductCard key={t.id} template={t} logo={activeCategory} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

