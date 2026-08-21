import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeLikePattern } from "@/lib/username";
import AdminNumberHistoryFilterBar from "@/components/AdminNumberHistoryFilterBar";

const PAGE_SIZE = 50;

const PROVIDER_LABELS = {
  daisysms: "USA & Canada",
  daisysim: "All countries",
  daisysim_usa: "US Only",
};

const STATUS_BADGE = {
  waiting: "badge-warning",
  received: "badge-success",
  done: "badge-neutral",
  cancelled: "badge-danger",
  expired: "badge-danger",
};

// Every number ever purchased, across all three providers and both
// short-term and long-term rentals — same shape as /admin/transactions, just
// against public.rentals instead of public.transactions. (/admin/numbers
// stays as-is for the long-term-only view with renewal controls; this is
// the full, unfiltered purchase history.)
export default async function AdminNumberHistoryPage({ searchParams }) {
  const admin = createAdminClient();

  const q = (searchParams?.q || "").trim();
  const page = Math.max(1, parseInt(searchParams?.page || "1", 10) || 1);

  let userIds = null; // null = no search filter applied
  if (q) {
    const pattern = `%${escapeLikePattern(q)}%`;
    const { data: matches } = await admin
      .from("profiles")
      .select("id")
      .or(`username.ilike.${pattern},email.ilike.${pattern}`);
    userIds = (matches || []).map((m) => m.id);
    if (userIds.length === 0) {
      userIds = ["00000000-0000-0000-0000-000000000000"];
    }
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let listQuery = admin
    .from("rentals")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (userIds) listQuery = listQuery.in("user_id", userIds);

  const { data: rentals, count } = await listQuery;

  // Total revenue across every matching row, not just this page — same
  // amount-only-column approach as /admin/transactions.
  let totalQuery = admin.from("rentals").select("price");
  if (userIds) totalQuery = totalQuery.in("user_id", userIds);
  const { data: totalRows } = await totalQuery;
  const totalAmount = (totalRows || []).reduce((sum, r) => sum + Number(r.price || 0), 0);

  const txUserIds = [...new Set((rentals || []).map((r) => r.user_id))];
  const { data: users } =
    txUserIds.length > 0
      ? await admin.from("profiles").select("id, username, email").in("id", txUserIds)
      : { data: [] };
  const userById = new Map((users || []).map((u) => [u.id, u]));

  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Number history</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          Every number ever purchased, across all providers and customers — short-term and
          long-term alike.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <div className="card card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-1">
            {q ? "Matching purchases" : "Total purchases"}
          </div>
          <div className="text-2xl font-bold">{(count || 0).toLocaleString()}</div>
        </div>
        <div className="card card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-1">
            {q ? "Matching revenue" : "Total revenue"}
          </div>
          <div className="text-2xl font-bold">₦{totalAmount.toLocaleString()}</div>
        </div>
      </div>

      <div className="mb-4">
        <AdminNumberHistoryFilterBar initialQuery={q} />
      </div>

      <div className="card card-pad">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 border-b border-gray-100 dark:border-night-700">
                <th className="pb-2.5 font-bold">User</th>
                <th className="pb-2.5 font-bold">Number</th>
                <th className="pb-2.5 font-bold">Service</th>
                <th className="pb-2.5 font-bold">Provider</th>
                <th className="pb-2.5 font-bold">Price</th>
                <th className="pb-2.5 font-bold">Status</th>
                <th className="pb-2.5 font-bold">Purchased</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-night-800">
              {(rentals || []).length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-gray-400 dark:text-night-400">
                    {q ? "No purchases match that search." : "No numbers purchased yet."}
                  </td>
                </tr>
              )}
              {(rentals || []).map((r) => {
                const user = userById.get(r.user_id);
                return (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-3 font-semibold dark:text-night-100">
                      {user?.username || user?.email || r.user_id}
                    </td>
                    <td className="py-2.5 pr-3 font-mono dark:text-night-100">{r.phone_number}</td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-night-300 max-w-[10rem] truncate">
                      {r.service_name || r.service_id || "—"}
                      {r.is_long_term && (
                        <span className="badge badge-neutral ml-1.5 text-[10px]">LTR</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-night-300">
                      {PROVIDER_LABELS[r.provider] || r.provider}
                    </td>
                    <td className="py-2.5 pr-3 font-bold text-brand-700 dark:text-brand-400">
                      ₦{Number(r.price).toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`badge ${STATUS_BADGE[r.status] || "badge-neutral"}`}>{r.status}</span>
                    </td>
                    <td className="py-2.5 text-gray-400 dark:text-night-400 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
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
                href={`/admin/number-history?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${page - 1}`}
                aria-disabled={page <= 1}
                className={`btn-secondary btn-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
              >
                Previous
              </Link>
              <Link
                href={`/admin/number-history?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${page + 1}`}
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
