import Link from "next/link";

export default function UsersList({ users, query = "" }) {
  return (
    <>
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
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-sm text-gray-400 dark:text-night-400">
                  {query ? `No users match "${query}".` : "No users found."}
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 dark:border-night-700 last:border-0">
                  <td className="py-3.5 font-semibold">{u.username || "—"}</td>
                  <td className="py-3.5 text-gray-500 dark:text-night-400">{u.email}</td>
                  <td className="py-3.5">
                    <span className={`badge ${u.role === "admin" ? "badge-success" : "badge-neutral"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3.5 font-semibold">₦{Number(u.balance).toLocaleString("en-US")}</td>
                  <td className="py-3.5 text-gray-400 dark:text-night-400">
                    {new Date(u.created_at).toLocaleDateString("en-US")}
                  </td>
                  <td className="py-3.5">
                    <Link href={`/admin/users/${u.id}`} className="btn-ghost btn-sm">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
