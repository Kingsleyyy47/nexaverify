"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_BADGE = {
  pending: "badge-warning",
  approved: "badge-success",
  rejected: "badge-danger",
};

export default function TopupRequestRow({ request, userEmail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function review(action) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/topups/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-gray-50 dark:border-night-700 last:border-0">
      <td className="py-3.5">{userEmail}</td>
      <td className="py-3.5 font-semibold">₦{Number(request.amount_ngn).toLocaleString()}</td>
      <td className="py-3.5 text-gray-400 dark:text-night-400">{request.note || "—"}</td>
      <td className="py-3.5 text-gray-400 dark:text-night-400">
        {new Date(request.created_at).toLocaleString()}
      </td>
      <td className="py-3.5">
        <span className={`badge ${STATUS_BADGE[request.status]}`}>{request.status}</span>
      </td>
      <td className="py-3.5">
        {request.status === "pending" ? (
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => review("approve")} className="btn-primary btn-sm">
              Approve
            </button>
            <button disabled={busy} onClick={() => review("reject")} className="btn-secondary btn-sm">
              Reject
            </button>
          </div>
        ) : (
          <span className="text-xs text-gray-400 dark:text-night-400">
            {request.reviewed_at ? new Date(request.reviewed_at).toLocaleDateString() : ""}
          </span>
        )}
        {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
      </td>
    </tr>
  );
}
