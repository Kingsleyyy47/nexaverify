"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LiveRateSyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleSync() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/currency-rates/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refresh failed");
      const overrideNote = data.overridden > 0 ? ` (${data.overridden} left on custom rate)` : "";
      setNotice(`Refreshed ${data.updated} live rate${data.updated === 1 ? "" : "s"}.${overrideNote}`);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={handleSync} disabled={loading} className="btn-secondary">
        {loading ? "Refreshing…" : "Refresh live rates"}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      {notice && <span className="text-xs text-brand-700 dark:text-brand-400">{notice}</span>}
    </div>
  );
}
