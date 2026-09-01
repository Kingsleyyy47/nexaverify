import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeLikePattern } from "@/lib/username";
import AdminTelegramHistoryFilterBar from "@/components/AdminTelegramHistoryFilterBar";

const PAGE_SIZE = 50;

const TYPE_LABELS = {
  star: "Stars",
  premium: "Premium",
};

const STATUS_BADGE = {
  pending: "badge-warning",
  processing: "badge-warning",
  completed: "badge-success",
  failed: "badge-danger",
};

// Every Telegram Stars/Premium order ever placed via iStar — same shape as
// /admin/number-history, just against public.telegram_gift_orders instead of
// public.rentals. Only admins can place these (see /products/telegram-premium
// and public.istar_config), so this doubles as an audit trail of admin test
// purchases until the feature opens up to customers.
export default async function AdminTelegramHistoryPage({ searchParams }) {
  const admin = createAdminClient();

  const q = (searchParams?.q || "").trim();
  const page = Math.max(1, parseInt(searchParams?.page || "1", 10) || 1);

  let userIds = [];
  if (q) {
    const pattern = `%${escapeLikePattern(q)}%`;
    const { data: matches } = await admin
      .from("profiles")
      .select("id")
      .or(`username.ilike.${pattern},email.ilike.${pattern}`);
    userIds = (matches || []).map((m) => m.id);
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let listQuery = admin
    .from("telegram_gift_orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (q) {
    const pattern = `%${escapeLikePattern(q)}%`;
    const orParts = [`recipient_username.ilike.${pattern}`];
    if (userIds.length > 0) orParts.push(`user_id.in.(${userIds.join(",")})`);
    listQuery = listQuery.or(orParts.join(","));
  }

  const { data: orders, count } = await listQuery;

  // Total spend across every matching row, not just this page — same
  // amount-only-column approach as /admin/transactions and /admin/number-history.
  let totalQuery = admin.from("telegram_gift_orders").select("price");
  if (q) {
    const pattern = `%${escapeLikePattern(q)}%`;
    const orParts = [`recipient_username.ilike.${pattern}`];
    if (userIds.length > 0) orParts.push(`user_id.in.(${userIds.join(",")})`);
    totalQuery = totalQuery.or(orParts.join(","));
  }
  const { data: totalRows } = await totalQuery;
  const totalAmount = (totalRows || []).reduce((sum, r) => sum + Number(r.price || 0), 0);

  const orderUserIds = [...new Set((orders || []).map((o) => o.user_id))];
  const { data: users } =
    orderUserIds.length > 0
      ? await admin.from("profiles").select("id, username, email").in("id", orderUserIds)
      : { data: [] };
  const userById = new Map((users || []).map((u) => [u.id, u]));

  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Telegram history</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          Every Telegram Stars/Premium order ever placed. Admin-only for now — see{" "}
          <Link href="/admin/telegram-premium" className="text-brand-700 dark:text-brand-400 font-semibold">
            Telegram Premium settings
          </Link>
          .
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <div className="card card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-1">
            {q ? "Matching orders" : "Total orders"}
          </div>
          <div className="text-2xl font-bold">{(count || 0).toLocaleString("en-US")}</div>
        </div>
        <div className="card card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-1">
            {q ? "Matching spend" : "Total spend"}
          </div>
          <div className="text-2xl font-bold">₦{totalAmount.toLocaleString("en-US")}</div>
        </div>
      </div>

      <div className="mb-4">
        <AdminTelegramHistoryFilterBar initialQuery={q} />
      </div>

      <div className="card card-pad">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 border-b border-gray-100 dark:border-night-700">
                <th className="pb-2.5 font-bold">User</th>
                <th className="pb-2.5 font-bold">Recipient</th>
                <th className="pb-2.5 font-bold">Type</th>
                <th className="pb-2.5 font-bold">Qty / Months</th>
                <th className="pb-2.5 font-bold">Price</th>
                <th className="pb-2.5 font-bold">Wallet</th>
                <th className="pb-2.5 font-bold">Provider charged</th>
                <th className="pb-2.5 font-bold">Status</th>
                <th className="pb-2.5 font-bold">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-night-800">
              {(orders || []).length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-gray-400 dark:text-night-400">
                    {q ? "No orders match that search." : "No Telegram orders placed yet."}
                  </td>
                </tr>
              )}
              {(orders || []).map((o) => {
                const user = userById.get(o.user_id);
                return (
                  <tr key={o.id}>
                    <td className="py-2.5 pr-3 font-semibold dark:text-night-100">
                      {user?.username || user?.email || o.user_id}
                    </td>
                    <td className="py-2.5 pr-3 font-mono dark:text-night-100">@{o.recipient_username}</td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-night-300">
                      {TYPE_LABELS[o.order_type] || o.order_type}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-night-300">
                      {o.order_type === "star" ? o.quantity : `${o.months} mo`}
                    </td>
                    <td className="py-2.5 pr-3 font-bold text-brand-700 dark:text-brand-400">
                      ₦{Number(o.price).toLocaleString("en-US")}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-gray-500 dark:text-night-300">
                      {o.wallet_type || "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-night-300">
                      {o.provider_amount != null ? `${o.provider_amount} ${o.wallet_type || ""}` : "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`badge ${STATUS_BADGE[o.status] || "badge-neutral"}`}>{o.status}</span>
                      {o.refunded_at && <span className="badge badge-neutral ml-1.5 text-[10px]">Refunded</span>}
                    </td>
                    <td className="py-2.5 text-gray-400 dark:text-night-400 whitespace-nowrap">
                      {new Date(o.created_at).toLocaleString("en-US")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100 dark:border-night-800 text-sm">
            <span className="text-gray-400 dark:text-night-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Link
                href={`/admin/telegram-history?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${page - 1}`}
                aria-disabled={page <= 1}
                className={`btn-secondary btn-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
              >
                Previous
              </Link>
              <Link
                href={`/admin/telegram-history?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${page + 1}`}
                aria-disabled={page >= totalPages}
                className={`btn-secondary btn-sm ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
              >
                Next
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
