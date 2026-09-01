"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_BADGE = {
  pending: "badge-warning",
  completed: "badge-success",
  failed: "badge-danger",
};

// Shows a customer's own PocketFi funding attempts. "Check status" covers
// the case where the redirect back from checkout never happened (closed
// tab, network hiccup) — it's safe to click repeatedly, the server only
// ever credits a given payment once (see lib/wallet-funding.js).
export default function PocketfiPaymentsList({ payments }) {
  const router = useRouter();
  const [checkingId, setCheckingId] = useState(null);
  const [error, setError] = useState("");

  async function handleCheck(paymentId) {
    setCheckingId(paymentId);
    setError("");
    try {
      const res = await fetch("/api/wallet/fund/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not check status");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setCheckingId(null);
    }
  }

  if (payments.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-night-400">No instant funding attempts yet.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {payments.map((p) => (
        <div
          key={p.id}
          className="flex items-center justify-between border-b border-gray-50 dark:border-night-700 last:border-0 pb-3 last:pb-0"
        >
          <div>
            <div className="font-semibold text-sm">₦{Number(p.amount_ngn).toLocaleString("en-US")}</div>
            <div className="text-xs text-gray-400 dark:text-night-400">
              {new Date(p.created_at).toLocaleString("en-US")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge ${STATUS_BADGE[p.status] || "badge-neutral"}`}>{p.status}</span>
            {p.status === "pending" && (
              <button
                onClick={() => handleCheck(p.payment_id)}
                disabled={checkingId === p.payment_id}
                className="btn-secondary btn-sm"
              >
                {checkingId === p.payment_id ? "Checking…" : "Check status"}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
