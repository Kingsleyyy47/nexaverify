"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

// Client-side filter over the already-fetched users list, same pattern as
// ProductsList — searches by username or email.
export default function UsersList({ users }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    );
  }, [users, query]);

  return (
    <>
      <div className="relative mb-4 max-w-xs">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username or email…"
          className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
        />
      </div>

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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-sm text-gray-400 dark:text-night-400">
                  No users match &quot;{query}&quot;.
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
