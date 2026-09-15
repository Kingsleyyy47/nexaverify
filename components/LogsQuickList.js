import Link from "next/link";
import { ChevronRight, Star } from "lucide-react";
import AdaptiveLogo from "./AdaptiveLogo";

// Dashboard preview of the Digital Accounts catalog — a horizontally
// scrollable row of cards (same "Popular Logs" carousel pattern as the
// reference storefront screenshot), sitting directly on the dashboard so a
// customer doesn't have to visit /digital-accounts just to see what's in
// stock. `items` is decided server-side in
// app/(customer)/dashboard/page.js (favorited templates first, then oldest,
// capped to a small preview — see that file's loadDigitalAccountsPreview()).
//
// No product name is shown here, same rule as the full browser
// (components/DigitalAccountsBrowser.js) — description is the only text,
// per the business owner's request. Description is shown in full, never
// truncated, for the same reason it isn't truncated there.
export default function LogsQuickList({ items }) {
  if (!items || items.length === 0) return null;

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

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
        {items.map((t) => {
          const outOfStock = t.stockCount <= 0;
          return (
            <div key={t.id} className="card card-pad w-64 shrink-0 snap-start flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                {t.logoUrl ? (
                  <AdaptiveLogo
                    logo={{ logoUrl: t.logoUrl, logoUrlDark: t.logoUrlDark }}
                    className="w-9 h-9 rounded-lg shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-lg shrink-0 bg-gray-100 dark:bg-night-800" />
                )}
                {t.categoryName && (
                  <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 truncate">
                    {t.categoryName}
                  </span>
                )}
                {t.favorite && (
                  <Star size={13} fill="currentColor" className="text-amber-400 shrink-0 ml-auto" />
                )}
              </div>

              {t.description && (
                <p className="text-sm text-gray-600 dark:text-night-300 flex-1">{t.description}</p>
              )}

              <div className="flex items-center justify-between gap-2 mt-3">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`badge ${outOfStock ? "badge-danger" : "badge-success"} text-[10px]`}>
                    {t.stockCount} pcs
                  </span>
                  <span className="badge badge-neutral text-[10px]">
                    ₦{Number(t.price_ngn).toLocaleString("en-US")}
                  </span>
                </div>
                {outOfStock ? (
                  <span className="badge badge-danger shrink-0 text-[10px]">Sold out</span>
                ) : (
                  <Link
                    href={`/digital-accounts/checkout/${t.id}`}
                    className="badge badge-success shrink-0 flex items-center gap-0.5 hover:opacity-80 transition text-[10px]"
                  >
                    Buy <ChevronRight size={11} />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
