"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { CategoryBanner, ProductCard } from "./DigitalAccountCard";

const ALL = "all";
// How many products a category section shows before collapsing the rest
// behind "See More" in the All view (per the reference layout — a handful of
// rows per category, then a link into that category's full list rather than
// a wall of products for every category at once).
const SECTION_PREVIEW_COUNT = 5;

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
// The "All" view itself (per a later reference screenshot, activestore.org)
// is now one section per category — a colored gradient banner (logo + name,
// see CategoryBanner/lib/categoryColors.js) plus a capped preview of that
// category's products, and a "See More" action that switches straight into
// the single-category view for the rest — rather than one flat grid mixing
// every category's products together. Each product card shows its FULL
// description (never truncated) and no longer repeats its own category
// name, since the banner above it already gives that context.
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

  // All view only: bucket the flat template list back into one group per
  // category (in the same order categories were returned), so each category
  // renders as its own "POPULAR LOGS"-style section instead of one mixed
  // grid — matching the reference layout. Categories with zero matching
  // products (e.g. everything filtered out by the search box) are skipped
  // entirely rather than showing an empty section.
  const sectionsByCategory = useMemo(() => {
    if (categoryId !== ALL) return null;
    const groups = {};
    for (const t of filteredTemplates) {
      (groups[t.category_id] ||= []).push(t);
    }
    return (categories || [])
      .filter((c) => groups[c.id]?.length)
      .map((c) => ({ category: c, items: groups[c.id] }));
  }, [filteredTemplates, categories, categoryId]);

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
        // All view: one section per category (logo + name + "See More" into
        // that category's own full list), each showing a capped preview of
        // its products — matching the reference layout instead of one mixed
        // grid across every category.
        <div className="space-y-6">
          {sectionsByCategory.map(({ category, items }) => (
            <CategorySection
              key={category.id}
              category={category}
              items={items}
              onSeeMore={() => selectCategory(category.id)}
            />
          ))}
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

// One category's section: the colored banner (with a "See More" action into
// that category's own full list) plus a capped preview of its products as a
// 2-column grid of cards.
function CategorySection({ category, items, onSeeMore }) {
  const preview = items.slice(0, SECTION_PREVIEW_COUNT);
  const hasMore = items.length > preview.length;

  return (
    <div>
      <CategoryBanner
        category={category}
        action={
          hasMore && (
            <button
              type="button"
              onClick={onSeeMore}
              className="flex items-center gap-0.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 rounded-full px-2.5 py-1 shrink-0 transition"
            >
              See More <ChevronRight size={13} />
            </button>
          )
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {preview.map((t) => (
          <ProductCard key={t.id} template={t} logo={category} />
        ))}
      </div>
    </div>
  );
}

