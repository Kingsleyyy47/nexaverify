import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeLikePattern } from "@/lib/username";
import AdminTransactionsFilterBar from "@/components/AdminTransactionsFilterBar";

const PAGE_SIZE = 50;

// Every deposit that has ever landed in a customer's wallet, from any
// source — manual top-up approval (app/api/admin/topups/review), a PocketFi
// checkout (lib/wallet-funding.js confirmAndCreditPocketfiPayment), or a
// PocketFi virtual-account bank transfer (creditVirtualAccountFromWebhook).
// All three go through the same adjust_balance() RPC with p_type='deposit',
// which is the ONLY thing that ever writes a row here — so this table is
// already the complete, authoritative deposit ledger. Nothing new to wire
// in; this page is just the first place to actually look at it.
export default async function AdminTransactionsPage({ searchParams }) {
  const admin = createAdminClient();

  const q = (searchParams?.q || "").trim();
  const page = Math.max(1, parseInt(searchParams?.page || "1", 10) || 1);

  // Search resolves to a set of user_ids first (profiles.username/email),
  // then filters transactions by that set — same two-step pattern as
  // /admin/topups since Postgrest can't join-and-filter-by-text across
  // tables in one call from the JS client.
  let userIds = null; // null = no search filter applied
  if (q) {
    const pattern = `%${escapeLikePattern(q)}%`;
    const { data: matches } = await admin
      .from("profiles")
      .select("id")
      .or(`username.ilike.${pattern},email.ilike.${pattern}`);
    userIds = (matches || []).map((m) => m.id);
    if (userIds.length === 0) {
      // No matching customer — force an empty result rather than showing
      // everyone (which is what an unfiltered .in([]) would otherwise do).
      userIds = ["00000000-0000-0000-0000-000000000000"];
    }
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let listQuery = admin
    .from("transactions")
    .select("*", { count: "exact" })
    .eq("type", "deposit")
    .order("created_at", { ascending: false })
    .range(from, to);
  if (userIds) listQuery = listQuery.in("user_id", userIds);

  const { data: transactions, count } = await listQuery;

  // Total deposited across every matching row, not just this page — a
  // second, lightweight query (amount only) rather than pulling full rows.
  // Fine at today's volume; if this table ever gets large enough for that
  // to matter, swap in a Postgres sum() instead of summing in JS.
  let totalQuery = admin.from("transactions").select("amount").eq("type", "deposit");
  if (userIds) totalQuery = totalQuery.in("user_id", userIds);
  const { data: totalRows } = await totalQuery;
  const totalAmount = (totalRows || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);

  const txUserIds = [...new Set((transactions || []).map((t) => t.user_id))];
  const { data: users } =
    txUserIds.length > 0
      ? await admin.from("profiles").select("id, username, email").in("id", txUserIds)
      : { data: [] };
  const userById = new Map((users || []).map((u) => [u.id, u]));

  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          Every deposit that's ever landed in a customer's wallet — manual top-up approvals and
          PocketFi payments (checkout and virtual-account transfers) alike.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <div className="card card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-1">
            {q ? "Matching deposits" : "Total deposits"}
          </div>
          <div className="text-2xl font-bold">{(count || 0).toLocaleString()}</div>
        </div>
        <div className="card card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-1">
            {q ? "Matching amount" : "Total amount"}
          </div>
          <div className="text-2xl font-bold">₦{totalAmount.toLocaleString()}</div>
        </div>
      </div>

      <div className="mb-4">
        <AdminTransactionsFilterBar initialQuery={q} />
      </div>

      <div className="card card-pad">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 border-b border-gray-100 dark:border-night-700">
                <th className="pb-2.5 font-bold">User</th>
                <th className="pb-2.5 font-bold">Amount</th>
                <th className="pb-2.5 font-bold">Source</th>
                {q && <th className="pb-2.5 font-bold">Balance after</th>}
                <th className="pb-2.5 font-bold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-night-800">
              {(transactions || []).length === 0 && (
                <tr>
                  <td colSpan={q ? 5 : 4} className="py-6 text-center text-gray-400 dark:text-night-400">
                    {q ? "No deposits match that search." : "No deposits yet."}
                  </td>
                </tr>
              )}
              {(transactions || []).map((t) => {
                const user = userById.get(t.user_id);
                return (
                  <tr key={t.id}>
                    <td className="py-2.5 pr-3 font-semibold dark:text-night-100">
                      {user?.username || user?.email || t.user_id}
                    </td>
                    <td className="py-2.5 pr-3 font-bold text-brand-700 dark:text-brand-400">
                      +₦{Number(t.amount).toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-night-300 max-w-xs truncate">
                      {t.note || "—"}
                    </td>
                    {q && (
                      <td className="py-2.5 pr-3 text-gray-500 dark:text-night-300">
                        ₦{Number(t.balance_after).toLocaleString()}
                      </td>
                    )}
                    <td className="py-2.5 text-gray-400 dark:text-night-400 whitespace-nowrap">
                      {new Date(t.created_at).toLocaleString()}
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
                href={`/admin/transactions?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${page - 1}`}
                aria-disabled={page <= 1}
                className={`btn-secondary btn-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
              >
                Previous
              </Link>
              <Link
                href={`/admin/transactions?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${page + 1}`}
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
