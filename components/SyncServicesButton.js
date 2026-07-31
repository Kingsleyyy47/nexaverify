"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncServicesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSync() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/services/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
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
        {loading ? "Syncing…" : "Sync from DaisySMS"}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
