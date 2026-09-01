import Link from "next/link";
import { Star } from "lucide-react";

// Dashboard preview of the Digital Accounts ("Buy Logs") catalog, shown
// above Phone Verifications. `items` is already decided server-side in
// app/(customer)/dashboard/page.js: favorited templates if any exist,
// otherwise a random sample — see that file's comment for why.
export default function LogsQuickList({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="card card-pad mb-7">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-lg">Logs</h3>
        <Link href="/digital-accounts" className="text-xs font-semibold text-brand-700 dark:text-brand-400">
          View all →
        </Link>
      </div>
      <p className="text-xs text-gray-400 dark:text-night-400 mt-1 mb-4">
        Ready-made accounts, delivered instantly.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t) => {
          const outOfStock = t.stockCount <= 0;
          return (
            <Link
              key={t.id}
              href="/digital-accounts"
              className="rounded-xl border border-gray-100 dark:border-night-700 p-3.5 hover:border-brand-300 dark:hover:border-brand-500 transition"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-night-400 truncate">
                  {t.categoryName}
                </span>
                {t.favorite && <Star size={13} fill="currentColor" className="text-amber-400 shrink-0" />}
              </div>
              <div className="font-semibold text-sm mt-1 truncate">{t.name}</div>
              <div className="flex items-center justify-between mt-2">
                <span className="font-bold text-sm">₦{Number(t.price_ngn).toLocaleString("en-US")}</span>
                <span className={`badge ${outOfStock ? "badge-danger" : "badge-success"} text-[10px]`}>
                  {outOfStock ? "Out of stock" : `${t.stockCount} in stock`}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
