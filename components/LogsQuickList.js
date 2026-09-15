import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CategoryBanner, ProductCard } from "./DigitalAccountCard";

// Dashboard preview of the Digital Accounts catalog — grouped into the exact
// same colored-gradient-banner + 2-column card grid as the full
// /digital-accounts page (components/DigitalAccountCard.js is shared
// between the two, so this is never just similar, it's identical). No more
// horizontal scroll: everything renders as stacked, non-scrolling category
// sections, same as the full page. `items` is a flat, already-capped list
// decided server-side in app/(customer)/dashboard/page.js (favorited
// templates first, then oldest — see that file's loadDigitalAccountsPreview()),
// bucketed back into one section per category here, in first-seen order.
export default function LogsQuickList({ items }) {
  if (!items || items.length === 0) return null;

  const groups = [];
  const groupByKey = new Map();
  for (const t of items) {
    const key = t.categoryId || t.categoryName || "uncategorized";
    if (!groupByKey.has(key)) {
      const group = {
        key,
        category: { id: t.categoryId, name: t.categoryName, logoUrl: t.logoUrl, logoUrlDark: t.logoUrlDark },
        items: [],
      };
      groupByKey.set(key, group);
      groups.push(group);
    }
    // ProductCard expects `availableCount` (the full catalog API's field
    // name) — normalized here since this preview's own query names it
    // `stockCount` (see loadDigitalAccountsPreview), so the shared card only
    // ever has one contract to satisfy.
    groupByKey.get(key).items.push({ ...t, availableCount: t.stockCount });
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

      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.key}>
            <CategoryBanner category={g.category} compact />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {g.items.map((t) => (
                <ProductCard key={t.id} template={t} logo={g.category} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
