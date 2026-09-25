"use client";

import { useState } from "react";

// Recovery tool for the Sept 2026 silent-failure bug: real, correctly-signed
// PocketFi webhooks whose deposit never got credited because a transient
// database hiccup was silently swallowed (see lib/wallet-funding.js). Every
// affected event is still sitting in pocketfi_webhook_events, untouched —
// nothing was lost. "Preview" is read-only. "Run backfill" actually credits,
// but is safe to run more than once: a transfer that's already been credited
// comes back "already processed" and is never charged twice.
export default function PocketfiBackfillPanel() {
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handlePreview() {
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pocketfi/backfill-webhooks");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setPreview(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRun() {
    if (!confirm("This will credit every unmatched PocketFi deposit found. Continue?")) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pocketfi/backfill-webhooks", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Backfill failed");
      setResult(data);
      setPreview(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card card-pad mt-6 max-w-lg">
      <h2 className="font-bold text-sm mb-2">Unmatched deposit recovery</h2>
      <p className="text-xs text-gray-400 dark:text-night-400 mb-4">
        Finds every correctly-signed PocketFi webhook that never got matched to a wallet credit,
        and credits them using the same logic the live webhook uses. Safe to run more than once.
      </p>

      <div className="flex gap-2 mb-4">
        <button type="button" onClick={handlePreview} disabled={loading} className="btn-secondary flex-1">
          {loading ? "Working…" : "Preview"}
        </button>
        <button type="button" onClick={handleRun} disabled={loading} className="btn-primary flex-1">
          {loading ? "Working…" : "Run backfill"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

      {preview && (
        <div className="text-xs space-y-2">
          <p>
            {preview.totalUnmatched} unmatched event(s) found — {preview.resolvable} look resolvable,{" "}
            {preview.unresolvable} don&apos;t resolve to any known account or payment.
          </p>
          <div className="max-h-64 overflow-auto border border-gray-100 dark:border-night-800 rounded-lg divide-y divide-gray-100 dark:divide-night-800">
            {preview.rows.map((r) => (
              <div key={r.id} className="p-2">
                <div className="font-mono">{r.received_at}</div>
                <div>
                  account {r.candidateAccountNumber || "—"} · ₦{r.amountNgn ?? "—"} ·{" "}
                  {r.resolvable ? "would resolve" : "no matching account"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div className="text-xs space-y-2">
          <p>
            Processed {result.processed}: {result.credited} credited, {result.alreadyProcessed} already processed,{" "}
            {result.stillFailed} still failed, {result.unresolvable} unresolvable.
          </p>
          {result.stillFailed > 0 && (
            <p className="text-red-600 dark:text-red-400">
              {result.stillFailed} row(s) failed again — check the error_logs table for their reference IDs.
            </p>
          )}
          <div className="max-h-64 overflow-auto border border-gray-100 dark:border-night-800 rounded-lg divide-y divide-gray-100 dark:divide-night-800">
            {result.results.map((r) => (
              <div key={r.id} className="p-2">
                <div className="font-mono">{r.received_at}</div>
                <div>
                  account {r.candidateAccountNumber || "—"} · ₦{r.amountNgn ?? "—"} · {r.outcome}
                  {r.referenceId ? ` (${r.referenceId})` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
