import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CategoryBanner, ProductCard } from "./DigitalAccountCard";

// The single generic banner every product sits under here — same stand-in
// used by the full /digital-accounts page's merged "All" view
// (components/DigitalAccountsBrowser.js) so the two stay identical rather
// than just similar.
const POPULAR_BANNER = { id: "popular-logs", name: "Popular Logs" };

// Dashboard preview of the Digital Accounts catalog — one generic banner
// followed by every product together in a single flat grid, using the exact
// same CategoryBanner/ProductCard components as the full /digital-accounts
// page (components/DigitalAccountCard.js is shared between the two). Each
// card still shows its own category's logo. No horizontal scroll and no
// per-category separation — matches the full page's merged "All" view.
// `items` is a flat, already-capped list decided server-side in
// app/(customer)/dashboard/page.js (favorited templates first, then oldest —
// see that file's loadDigitalAccountsPreview()).
export default function LogsQuickList({ items }) {
  if (!items || items.length === 0) return null;

  // Per-card logo lookup only — products are no longer grouped/sectioned by
  // category, but each card still shows its own category's icon.
  const categoryById = {};
  for (const t of items) {
    if (t.categoryId && !categoryById[t.categoryId]) {
      categoryById[t.categoryId] = { id: t.categoryId, name: t.categoryName, logoUrl: t.logoUrl, logoUrlDark: t.logoUrlDark };
    }
  }

  return (
    <div className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-[15px]">Logs</h3>
        <Link
          href="/digital-accounts"
          className="flex items-center gap-0.5 text-xs font-semibold text-brand-700 dark:text-brand-400"
        >
          View all <ChevronRight size={13} />
        </Link>
      </div>

      <CategoryBanner category={POPULAR_BANNER} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((t) => (
          // ProductCard expects `availableCount` (the full catalog API's
          // field name) — normalized here since this preview's own query
          // names it `stockCount` (see loadDigitalAccountsPreview).
          <ProductCard key={t.id} template={{ ...t, availableCount: t.stockCount }} logo={categoryById[t.categoryId]} />
        ))}
      </div>
    </div>
  );
}
