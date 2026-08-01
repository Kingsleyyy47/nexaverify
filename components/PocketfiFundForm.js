"use client";

import { useState } from "react";

// Instant wallet funding via PocketFi (card / bank transfer / mobile
// wallet) — redirects the browser to PocketFi's hosted checkout page.
// Distinct from the manual, admin-reviewed top-up request further down
// this page (TopupForm.js), which stays in place for bank-transfer
// customers who'd rather not use the hosted checkout.
export default function PocketfiFundForm() {
  const [amount, setAmount] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
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
        body: JSON.stringify({ amount: Number(amount), firstName, lastName, phone }),
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

      <div className="grid grid-cols-2 gap-3">
        <div className="field">
          <label htmlFor="pf-first-name">First name</label>
          <input
            id="pf-first-name"
            type="text"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="e.g. Musa"
          />
        </div>
        <div className="field">
          <label htmlFor="pf-last-name">Last name</label>
          <input
            id="pf-last-name"
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="e.g. Damilare"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="pf-phone">Phone number</label>
        <input
          id="pf-phone"
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g. 09065903789"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Redirecting…" : "Fund wallet now"}
      </button>
    </form>
  );
}
