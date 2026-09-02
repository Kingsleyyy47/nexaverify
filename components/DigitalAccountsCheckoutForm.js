"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900";

// The actual purchase step — description, quantity, live total, one Buy Now
// button. On success this redirects to /digital-accounts/orders (order
// history), NOT straight into the specific order's page — the credentials
// are what's "waiting" there, same idea as any other checkout ending on an
// order-confirmation/history screen rather than dropping the buyer straight
// into the receipt.
export default function DigitalAccountsCheckoutForm({ template, initialQuantity }) {
  const router = useRouter();
  const outOfStock = template.availableCount <= 0;
  const [quantity, setQuantity] = useState(
    Math.max(1, Math.min(initialQuantity, Math.max(template.availableCount, 1)))
  );
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");

  const totalNgn = useMemo(() => template.priceNgn * quantity, [template.priceNgn, quantity]);

  function handleQuantityChange(value) {
    const n = Math.max(1, Math.min(Number(value) || 1, Math.max(template.availableCount, 1)));
    setQuantity(n);
  }

  async function handleBuy() {
    setError("");
    if (quantity > template.availableCount) {
      setError("Not enough stock left for that quantity.");
      return;
    }
    setBuying(true);
    try {
      const res = await fetch("/api/digital-accounts/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id, quantity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not complete the purchase.");
      router.push("/digital-accounts/orders");
    } catch (err) {
      setError(err.message);
      setBuying(false);
    }
  }

  return (
    <div className="card card-pad space-y-5">
      {template.description && (
        <p className="text-sm text-gray-600 dark:text-night-300">{template.description}</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="text-lg font-bold">₦{template.priceNgn.toLocaleString("en-US")} each</div>
        <span className={`badge ${outOfStock ? "badge-danger" : "badge-success"}`}>
          {template.availableCount} pcs
        </span>
        {outOfStock && <span className="badge badge-danger">Sold out</span>}
      </div>

      <div>
        <label className="block text-sm font-bold mb-1.5">Quantity</label>
        <input
          type="number"
          min={1}
          max={Math.max(template.availableCount, 1)}
          value={quantity}
          onChange={(e) => handleQuantityChange(e.target.value)}
          disabled={outOfStock}
          className={`${INPUT_CLASS} disabled:opacity-50 disabled:cursor-not-allowed`}
        />
      </div>

      <div className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-night-800 px-3.5 py-2.5">
        <span className="text-xs font-semibold text-gray-500 dark:text-night-300">Total</span>
        <span className="font-bold text-sm">₦{totalNgn.toLocaleString("en-US")}</span>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        onClick={handleBuy}
        disabled={outOfStock || buying}
        className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {outOfStock ? "Sold out" : buying ? "Placing order…" : "Buy Now"}
      </button>
    </div>
  );
}
