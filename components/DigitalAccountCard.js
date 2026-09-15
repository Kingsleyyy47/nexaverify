import Link from "next/link";
import { Star, ChevronRight } from "lucide-react";
import AdaptiveLogo from "./AdaptiveLogo";
import { categoryBannerGradient } from "@/lib/categoryColors";

// Shared between the full /digital-accounts page
// (components/DigitalAccountsBrowser.js) and the dashboard's "Logs" preview
// (components/LogsQuickList.js) so the two are never just similar but
// pixel-identical — one place to change the banner/card look for both.

// The colored banner every category is introduced by — a solid gradient bar
// (deterministically assigned per category, see lib/categoryColors.js) with
// its logo in a small white badge and its name in white text, per the
// business owner's reference screenshots. `action` is optional trailing
// content (e.g. a "See More" button).
export function CategoryBanner({ category, action, compact = false }) {
  if (!category) return null;
  const gradient = categoryBannerGradient(category.id || category.name);
  const badgeSize = compact ? "w-7 h-7" : "w-8 h-8";
  const logoSize = compact ? "w-5 h-5" : "w-6 h-6";

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r ${gradient} ${compact ? "px-3.5 py-2" : "px-4 py-3"} mb-2`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`${badgeSize} rounded-lg bg-white flex items-center justify-center shrink-0 overflow-hidden`}>
          {category.logoUrl ? (
            <AdaptiveLogo
              logo={{ logoUrl: category.logoUrl, logoUrlDark: category.logoUrlDark }}
              className={`${logoSize} rounded`}
            />
          ) : (
            <div className="w-3 h-3 rounded-full bg-gray-300" />
          )}
        </div>
        <h3 className={`font-bold text-white truncate ${compact ? "text-xs" : "text-sm"}`}>{category.name}</h3>
      </div>
      {action}
    </div>
  );
}

// One product card — icon, FULL description (never truncated, per the
// business owner's request), then pcs/price/Buy below. No category name is
// shown on the card itself: the banner above it already gives that context.
// `template.availableCount` is the live stock count field name the full
// catalog API uses; callers with a different field name (e.g. the
// dashboard's `stockCount`) should normalize it before passing the template
// in, so this component only ever has one contract to satisfy.
export function ProductCard({ template: t, logo }) {
  const outOfStock = t.availableCount <= 0;

  return (
    <div className="rounded-xl border border-gray-100 dark:border-night-700 p-3.5">
      <div className="flex items-start gap-2.5">
        {logo?.logoUrl ? (
          <AdaptiveLogo
            logo={{ logoUrl: logo.logoUrl, logoUrlDark: logo.logoUrlDark }}
            className="w-9 h-9 rounded-lg shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-lg shrink-0 bg-gray-100 dark:bg-night-800" />
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
          <div className="flex items-center justify-between gap-2 mt-2.5">
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
    </div>
  );
}
