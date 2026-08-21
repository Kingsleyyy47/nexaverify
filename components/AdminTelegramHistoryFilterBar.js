"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

// Same pattern as AdminNumberHistoryFilterBar/AdminTransactionsFilterBar —
// plain GET-style search, submitting pushes `?q=...` onto the URL for the
// server component to re-query with.
export default function AdminTelegramHistoryFilterBar({ initialQuery = "" }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/admin/telegram-history?q=${encodeURIComponent(trimmed)}` : "/admin/telegram-history");
  }

  return (
    <form onSubmit={handleSubmit} className="relative max-w-sm">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-night-400" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by username, email, or recipient…"
        className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
      />
    </form>
  );
}
