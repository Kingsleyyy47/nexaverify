"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

// Manually triggers the SAME auto-cancel/auto-refund sweep that already runs
// every minute via pg_cron (see app/api/admin/rentals/sweep-timeouts) — every
// provider's rentals (DaisySMS, DaisySim, US Only) share one table and one
// rule: any short-term rental that's gone RENTAL_BACKEND_TIMEOUT_MINUTES
// without a code gets cancelled on the provider and refunded to the
// customer's wallet automatically. This button doesn't do anything the cron
// job isn't already doing on its own within the next minute — it just lets
// an admin force it to run right now and see the result, instead of taking
// it on faith that the automatic sweep is working. Added after a Sept 2026
// report of a DaisySMS purchase failing on NexaVerify's side while DaisySMS
// itself still rented and charged for the number — an already-"waiting"
// rental in our own table is unaffected by that specific bug (it already
// succeeded end to end), so this exists for peace of mind and to clear
// anything genuinely stuck, not because the sweep itself was found broken.
export default function SweepTimeoutsButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleRun() {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/rentals/sweep-timeouts", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sweep failed.");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-400 dark:text-night-400 mb-3 max-w-lg">
        Cancels and refunds any short-term rental (any provider, including DaisySMS) that's been
        waiting for a code past the normal timeout — the same thing that already happens
        automatically every minute. Use this to force it to run immediately instead of waiting.
      </p>
      <button onClick={handleRun} disabled={running} className="btn-secondary btn-sm flex items-center gap-1.5">
        <RefreshCw size={14} className={running ? "animate-spin" : ""} />
        {running ? "Sweeping…" : "Sweep stuck rentals now"}
      </button>

      {error && <p className="text-sm text-red-600 dark:text-red-400 mt-3">{error}</p>}

      {result && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
          <Stat label="Checked" value={result.checked} />
          <Stat label="Cancelled" value={result.cancelled} />
          <Stat label="Refunded" value={result.refunded} />
          <Stat label="Got code instead" value={result.receivedInstead} />
          <Stat label="Errors" value={result.errors} color={result.errors > 0 ? "text-red-600 dark:text-red-400" : ""} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color = "" }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-night-800 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold">{label}</div>
      <div className={`font-bold ${color}`}>{value ?? 0}</div>
    </div>
  );
}
