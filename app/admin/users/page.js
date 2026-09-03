import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeLikePattern } from "@/lib/username";
import AdminUsersFilterBar from "@/components/AdminUsersFilterBar";
import UsersList from "@/components/UsersList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 100;

export default async function AdminUsersPage({ searchParams }) {
  const admin = createAdminClient();

  const q = (searchParams?.q || "").trim();
  const page = Math.max(1, parseInt(searchParams?.page || "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let usersQuery = admin
    .from("profiles")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (q) {
    const pattern = `%${escapeLikePattern(q)}%`;
    usersQuery = usersQuery.or(`username.ilike.${pattern},email.ilike.${pattern}`);
  }

  const { data: users, count } = await usersQuery;
  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));
  const baseHref = q ? `/admin/users?q=${encodeURIComponent(q)}&` : "/admin/users?";

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          Find a user, view their balance and transaction history, or adjust their balance.
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <AdminUsersFilterBar initialQuery={q} />
        <div className="text-sm font-semibold text-gray-500 dark:text-night-400">
          {(count || 0).toLocaleString("en-US")} {q ? "matching" : "total"} users
        </div>
      </div>

      <div className="card card-pad">
        <UsersList users={users || []} query={q} />

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100 dark:border-night-800 text-sm">
            <span className="text-gray-400 dark:text-night-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Link
                href={`${baseHref}page=${page - 1}`}
                aria-disabled={page <= 1}
                className={`btn-secondary btn-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
              >
                Previous
              </Link>
              <Link
                href={`${baseHref}page=${page + 1}`}
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
