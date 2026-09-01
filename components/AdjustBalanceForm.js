"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdjustBalanceForm({ userId }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch(`/api/admin/users/${userId}/adjust-balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Adjustment failed");

      setSuccess(`New balance: ₦${Number(data.balance).toLocaleString("en-US")}`);
      setAmount("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="field">
        <label htmlFor="amount">Amount (₦) — use a negative number to deduct</label>
        <input
          id="amount"
          type="number"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 5000 or -2000"
        />
      </div>
      <div className="field">
        <label htmlFor="note">Reason / note</label>
        <input
          id="note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Manual top-up via bank transfer"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {success && <p className="text-sm text-brand-700 dark:text-brand-400">{success}</p>}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Saving…" : "Apply adjustment"}
      </button>
    </form>
  );
}
