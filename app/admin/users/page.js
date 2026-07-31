import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminUsersPage() {
  const admin = createAdminClient();
  const { data: users } = await admin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          Find a user, view their balance and transaction history, or adjust their balance.
        </p>
      </div>

      <div className="card card-pad">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 border-b border-gray-100 dark:border-night-700">
                <th className="pb-2.5 font-bold">Username</th>
                <th className="pb-2.5 font-bold">Email</th>
                <th className="pb-2.5 font-bold">Role</th>
                <th className="pb-2.5 font-bold">Balance</th>
                <th className="pb-2.5 font-bold">Joined</th>
                <th className="pb-2.5 font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {(users || []).map((u) => (
                <tr key={u.id} className="border-b border-gray-50 dark:border-night-700 last:border-0">
                  <td className="py-3.5 font-semibold">{u.username || "—"}</td>
                  <td className="py-3.5 text-gray-500 dark:text-night-400">{u.email}</td>
                  <td className="py-3.5">
                    <span className={`badge ${u.role === "admin" ? "badge-success" : "badge-neutral"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3.5 font-semibold">₦{Number(u.balance).toLocaleString()}</td>
                  <td className="py-3.5 text-gray-400 dark:text-night-400">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3.5">
                    <Link href={`/admin/users/${u.id}`} className="btn-ghost btn-sm">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
