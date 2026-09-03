"use client";

import { useState } from "react";
import { Wrench, CheckCircle2, AlertTriangle } from "lucide-react";

// One-time (but safe to re-run) repair for accounts uploaded BEFORE the
// cookie/session-data auto-detect fix existed in lib/digitalAccountsCsv.js —
// those rows can have a cookie/csrftoken string sitting in "Email" with the
// real email pushed into "Mail Pass" (or another neighboring field) right
// next to it. Hitting this button re-scans every stocked account and every
// past order's stored credentials with the same detection the upload parser
// now uses at upload time (app/api/admin/digital-accounts/fix-legacy-cookies),
// recovering the real email where possible and moving the cookie text into
// a separate "Extra / Cookies" field.
export default function FixLegacyCookiesPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleRun() {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/digital-accounts/fix-legacy-cookies", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not run the repair.");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <h3 className="font-bold text-[15px] mb-1">Fix Already-Uploaded Accounts</h3>
      <p className="text-sm text-gray-400 dark:text-night-400 mb-3 max-w-lg">
        For accounts uploaded before cookie/session text was auto-detected — re-scans every stocked
        account (both CSV and TXT uploads) and every past order, and moves any cookie/csrftoken-looking
        text sitting in Email, Mail Pass, 2FA, or Recovery fields into a separate Extra field, recovering
        the real email where possible. Safe to run more than once.
      </p>
      <button
        onClick={handleRun}
        disabled={running}
        className="btn-secondary btn-sm flex items-center gap-1.5 disabled:opacity-50"
      >
        <Wrench size={14} /> {running ? "Scanning…" : "Run Repair"}
      </button>
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 mt-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}
      {result && (
        <div className="flex items-center gap-1.5 text-sm text-brand-700 dark:text-brand-400 mt-2">
          <CheckCircle2 size={14} />
          Fixed {result.stockFixed} stocked account{result.stockFixed === 1 ? "" : "s"} and{" "}
          {result.ordersFixed} past order{result.ordersFixed === 1 ? "" : "s"}.
        </div>
      )}
    </div>
  );
}
