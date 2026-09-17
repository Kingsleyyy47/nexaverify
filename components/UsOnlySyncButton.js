"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

// Pulls the CURRENTLY SELECTED backend's live catalog (Getatext or DaisySim
// — see daisysim_usa_config.backend) and makes sure every service it returns
// has a row in daisysim_usa_overrides, with an up-to-date name. Doesn't sync
// prices (both backends are always live — see lib/usOnlyCatalog.js) — this
// is about making a freshly-selected backend's services immediately
// manageable (favorite/disable/markup) instead of only lazily, one at a time
// as an admin happens to touch each one. UsOnlyConfigForm already calls the
// same endpoint automatically right after a backend swap — this button is
// for re-running it on demand (e.g. the provider added new services and
// they're not showing up in the catalog manager yet).
export default function UsOnlySyncButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleSync() {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/us-only/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button onClick={handleSync} disabled={running} className="btn-secondary btn-sm flex items-center gap-1.5">
        <RefreshCw size={14} className={running ? "animate-spin" : ""} />
        {running ? "Syncing…" : "Sync catalog"}
      </button>
      {result && (
        <span className="text-xs text-gray-400 dark:text-night-400">
          {result.synced} service(s) synced from {result.backend === "daisysim" ? "DaisySim" : "Getatext"}.
        </span>
      )}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
