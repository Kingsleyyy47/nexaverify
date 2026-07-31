"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncLtrsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleSync() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/rentals/sync-ltrs", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      const skippedNote =
        data.skipped > 0 ? ` ${data.skipped} skipped — set a USD rate in Currency rates.` : "";
      setNotice(`Synced ${data.updated}/${data.total} long-term rentals (${data.charged} charged).${skippedNote}`);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={handleSync} disabled={loading} className="btn-primary">
        {loading ? "Syncing…" : "Sync LTRs from DaisySMS"}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      {notice && <span className="text-xs text-brand-700 dark:text-brand-400">{notice}</span>}
    </div>
  );
}
