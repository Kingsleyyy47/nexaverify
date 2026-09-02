import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getSessionProfile } from "@/lib/auth";

// Where checkout (DigitalAccountsCheckoutForm.js) redirects to after a
// successful purchase — every past Digital Accounts order, newest first,
// each linking into its own Order Details page (still the only place the
// actual credentials are shown/downloaded — see
// app/(customer)/digital-accounts/orders/[id]/page.js). Deliberately not
// gated on digital_accounts_config.customer_visible: once an order exists it
// belongs to the customer who bought it regardless of whether the product is
// still publicly visible, same reasoning as the order details page's own
// ownership-only check.
export default async function DigitalAccountsOrderHistoryPage() {
  const { supabase } = await getSessionProfile();

  const { data: orders } = await supabase
    .from("digital_orders")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <Link
        href="/digital-accounts"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-night-400 hover:text-gray-800 dark:hover:text-night-100 mb-4"
      >
        <ArrowLeft size={16} /> Back
      </Link>

      <div className="mb-5">
        <h1 className="text-xl font-bold">Your orders</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          Every Digital Accounts purchase — tap one to view or download its credentials.
        </p>
      </div>

      {(orders || []).length === 0 ? (
        <div className="card card-pad text-sm text-gray-500 dark:text-night-400">
          No orders yet — head back to Digital Accounts to buy your first one.
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/digital-accounts/orders/${o.id}`}
              className="card card-pad flex items-center justify-between gap-3 hover:border-brand-300 dark:hover:border-brand-500 transition"
            >
              <div className="min-w-0">
                <div className="font-bold text-sm truncate">{o.template_name}</div>
                <div className="text-xs text-gray-400 dark:text-night-400 mt-0.5">
                  {o.category_name ? `${o.category_name} · ` : ""}
                  {o.quantity} item{o.quantity === 1 ? "" : "s"} ·{" "}
                  {new Date(o.created_at).toLocaleDateString("en-US")}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-bold text-sm">₦{Number(o.total_ngn).toLocaleString("en-US")}</span>
                <ArrowRight size={16} className="text-gray-400 dark:text-night-400" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
