import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeLikePattern } from "@/lib/username";
import AdminNotificationsFilterBar from "@/components/AdminNotificationsFilterBar";
import AdminNotificationRow from "@/components/AdminNotificationRow";

const PAGE_SIZE = 50;

// Every unexpected error a customer has ever seen (or that a background job
// hit), sourced from public.error_logs — see that table's comment in
// schema.sql and lib/errorLog.js/lib/apiError.js for how rows get here.
// Customers only ever see a generic message + reference ID; this page is the
// only place the real message/stack/provider-raw-response is ever readable,
// via the service role key (error_logs has no client-facing select policy
// at all, same pattern as digital_stock_items).
export default async function AdminNotificationsPage({ searchParams }) {
  const admin = createAdminClient();

  const q = (searchParams?.q || "").trim();
  const page = Math.max(1, parseInt(searchParams?.page || "1", 10) || 1);

  // Same two-step search pattern as /admin/transactions and
  // /admin/number-history (Postgrest can't join-and-filter-by-text across
  // tables in one call) — resolves a search term to a set of user_ids first,
  // then ORs that in alongside a direct match on reference_id/route.
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
    .from("error_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (q) {
    const pattern = `%${escapeLikePattern(q)}%`;
    const orParts = [`reference_id.ilike.${pattern}`, `route.ilike.${pattern}`];
    if (userIds.length > 0) orParts.push(`user_id.in.(${userIds.join(",")})`);
    listQuery = listQuery.or(orParts.join(","));
  }

  const { data: logs, count } = await listQuery;

  const logUserIds = [...new Set((logs || []).map((l) => l.user_id).filter(Boolean))];
  const { data: users } =
    logUserIds.length > 0
      ? await admin.from("profiles").select("id, username, email").in("id", logUserIds)
      : { data: [] };
  const userById = new Map((users || []).map((u) => [u.id, u]));

  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          Every error a customer has seen, or that a background job hit — each one logged with a
          reference ID, the route, who was signed in, and the real underlying error. Customers only
          ever see the reference ID and a generic message; the real detail only ever lives here.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <div className="card card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-1">
            {q ? "Matching errors" : "Total errors logged"}
          </div>
          <div className="text-2xl font-bold">{(count || 0).toLocaleString("en-US")}</div>
        </div>
      </div>

      <div className="mb-4">
        <AdminNotificationsFilterBar initialQuery={q} />
      </div>

      <div className="card !p-0">
        {(logs || []).length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-night-400">
            {q ? "No errors match that search." : "No errors logged yet."}
          </p>
        ) : (
          logs.map((log) => {
            const user = log.user_id ? userById.get(log.user_id) : null;
            const userLabel = user?.username || user?.email || (log.user_id ? log.user_id : "signed out");
            return <AdminNotificationRow key={log.id} log={log} userLabel={userLabel} />;
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100 dark:border-night-800 text-sm">
          <span className="text-gray-400 dark:text-night-400">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Link
              href={`/admin/notifications?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${page - 1}`}
              aria-disabled={page <= 1}
              className={`btn-secondary btn-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
            >
              Previous
            </Link>
            <Link
              href={`/admin/notifications?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${page + 1}`}
              aria-disabled={page >= totalPages}
              className={`btn-secondary btn-sm ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
            >
              Next
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
