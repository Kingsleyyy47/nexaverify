"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Star, ChevronRight, Search } from "lucide-react";
import AdaptiveLogo from "./AdaptiveLogo";

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
// is now one section per category — logo + name header, a capped preview of
// that category's products, and a "See More" link that switches straight
// into the single-category view for the rest — rather than one flat grid
// mixing every category's products together. Each product row shows its
// FULL description (never truncated) and no longer repeats its own category
// name, since the section header (or the picker, in single-category view)
// already gives that context.
//
// Rows are the tap target for "Buy" only — no inline quantity input or Buy
// Now button here (per the business owner's request: no repeating "Sold
// out" on a second control, and no asking for quantity twice). Tapping Buy
// on an in-stock row goes straight to its checkout page
// (app/(customer)/digital-accounts/checkout/[templateId]/page.js), which is
// where quantity is actually picked and the purchase happens. A sold-out
// row isn't a link at all — nothing to tap through to.
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
        // Single-category view: the full, uncapped list for that category —
        // full-width rows, same as inside a section above, just without the
        // repeated section header (the picker above already gives context).
        <div className="card divide-y divide-gray-100 dark:divide-night-800">
          {filteredTemplates.map((t) => (
            <ProductRow key={t.id} template={t} logo={activeCategory} />
          ))}
        </div>
      )}
    </div>
  );
}

// One category's section: header (logo, name, product count, "See More")
// plus a capped preview of its products as full-width rows.
function CategorySection({ category, items, onSeeMore }) {
  const preview = items.slice(0, SECTION_PREVIEW_COUNT);
  const hasMore = items.length > preview.length;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 dark:bg-night-800/60 border-b border-gray-100 dark:border-night-700">
        <div className="flex items-center gap-2.5 min-w-0">
          {category.logoUrl ? (
            <AdaptiveLogo
              logo={{ logoUrl: category.logoUrl, logoUrlDark: category.logoUrlDark }}
              className="w-8 h-8 rounded-lg shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg shrink-0 bg-gray-200 dark:bg-night-700" />
          )}
          <h3 className="font-bold text-sm truncate dark:text-night-100">{category.name}</h3>
        </div>
        {hasMore && (
          <button
            type="button"
            onClick={onSeeMore}
            className="flex items-center gap-0.5 text-xs font-semibold text-brand-700 dark:text-brand-400 shrink-0 hover:opacity-80"
          >
            See More <ChevronRight size={13} />
          </button>
        )}
      </div>
      <div className="divide-y divide-gray-100 dark:divide-night-800">
        {preview.map((t) => (
          <ProductRow key={t.id} template={t} />
        ))}
      </div>
    </div>
  );
}

// A single full-width product row — icon, FULL description (never
// truncated, per the business owner's request), then pcs/price/Buy below.
// No category name is shown on the row itself: whichever context it's
// rendered under (a section header in the All view, or the category picker
// in the single-category view) already says which category it belongs to.
function ProductRow({ template: t, logo }) {
  const outOfStock = t.availableCount <= 0;

  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      {logo?.logoUrl ? (
        <AdaptiveLogo
          logo={{ logoUrl: logo.logoUrl, logoUrlDark: logo.logoUrlDark }}
          className="w-10 h-10 rounded-lg shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-lg shrink-0 bg-gray-100 dark:bg-night-800" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          {t.description && (
            <p className="text-sm text-gray-600 dark:text-night-300 whitespace-pre-line">{t.description}</p>
          )}
          {t.favorite && <Star size={14} fill="currentColor" className="text-amber-400 shrink-0 mt-0.5" />}
        </div>

        {/* "X pcs" is always plain, informational text — untouched. The
            right-hand pill does double duty instead of adding a new
            control: in stock, it's a real "Buy" button straight into
            checkout; sold out, it reverts to plain, red, non-clickable
            "Sold out" text. */}
        <div className="flex items-center justify-between gap-2 mt-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`badge ${outOfStock ? "badge-danger" : "badge-success"}`}>{t.availableCount} pcs</span>
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
}
