"use client";

import { useState } from "react";

// Instant wallet funding via PocketFi (card / bank transfer / mobile
// wallet) — redirects the browser to PocketFi's hosted checkout page.
// Just asks for an amount; PocketFi's checkout requires a name/phone too,
// but the server fills those in with placeholder values (see
// app/api/wallet/fund/route.js) rather than making the customer type them.
export default function PocketfiFundForm() {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/wallet/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start funding session");

      window.location.href = data.paymentLink;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="field">
        <label htmlFor="pf-amount">Amount (₦)</label>
        <input
          id="pf-amount"
          type="number"
          min="1"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 5000"
        />
        <span className="hint">Pay by card, bank transfer, or mobile wallet — your balance updates automatically once payment completes.</span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Redirecting…" : "Fund wallet now"}
      </button>
    </form>
  );
}
