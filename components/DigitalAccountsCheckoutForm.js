"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { CredentialsList } from "./OrderCredentialsActions";

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900";

// The actual purchase step — description, quantity, live total, one Buy Now
// button. On success it keeps the buyer on this checkout page and opens the
// credentials immediately in a modal; /history still keeps the permanent
// order record and details link afterward.
export default function DigitalAccountsCheckoutForm({ template, initialQuantity }) {
  const router = useRouter();
  const outOfStock = template.availableCount <= 0;
  const startingQuantity = Number(initialQuantity);
  const [quantity, setQuantity] = useState(() =>
    Number.isInteger(startingQuantity) && startingQuantity > 0
      ? String(Math.max(1, Math.min(startingQuantity, Math.max(template.availableCount, 1))))
      : ""
  );
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");
  const [purchased, setPurchased] = useState(null);

  const quantityNumber = Number(quantity);
  const quantityIsValid = Number.isInteger(quantityNumber) && quantityNumber > 0;
  const exceedsStock = quantityIsValid && quantityNumber > template.availableCount;
  const totalNgn = useMemo(
    () => (quantityIsValid ? Math.round(template.priceNgn * quantityNumber * 100) / 100 : null),
    [quantityIsValid, quantityNumber, template.priceNgn]
  );
  const walletBalance = Number(template.walletBalanceNgn || 0);
  const insufficientBalance = totalNgn != null && walletBalance < totalNgn;
  const canBuy = !outOfStock && quantityIsValid && !exceedsStock && !insufficientBalance && !buying;
  const buttonLabel = outOfStock
    ? "Sold out"
    : buying
      ? "Placing order..."
      : !quantityIsValid
        ? "Enter quantity"
        : exceedsStock
          ? "Not enough stock"
          : insufficientBalance
            ? "Insufficient balance"
            : "Buy Now";

  function handleQuantityChange(value) {
    if (value === "") {
      setQuantity("");
      return;
    }
    if (!/^\d+$/.test(value)) return;
    setQuantity(value);
  }

  async function handleBuy() {
    setError("");
    if (!quantityIsValid) {
      setError("Enter how many accounts you want to buy.");
      return;
    }
    if (exceedsStock) {
      setError("Not enough stock left for that quantity.");
      return;
    }
    if (insufficientBalance) {
      setError(
        `Insufficient wallet balance. Required ₦${totalNgn.toLocaleString("en-US")}, wallet ₦${walletBalance.toLocaleString("en-US")}.`
      );
      return;
    }
    setBuying(true);
    try {
      const res = await fetch("/api/digital-accounts/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id, quantity: quantityNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not complete the purchase.");
      setPurchased({ order: data.order, credentials: data.credentials || [] });
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBuying(false);
    }
  }

  return (
    <>
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
          <span className="font-bold text-sm">
            {totalNgn == null ? "Enter quantity" : `₦${totalNgn.toLocaleString("en-US")}`}
          </span>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-night-800 px-3.5 py-2.5">
          <span className="text-xs font-semibold text-gray-500 dark:text-night-300">Wallet balance</span>
          <span className="font-bold text-sm">₦{walletBalance.toLocaleString("en-US")}</span>
        </div>

        {exceedsStock && <p className="text-sm text-red-600 dark:text-red-400">Only {template.availableCount} in stock.</p>}
        {insufficientBalance && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Required ₦{totalNgn.toLocaleString("en-US")}; wallet has ₦{walletBalance.toLocaleString("en-US")}.
          </p>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          onClick={handleBuy}
          disabled={!canBuy}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {buttonLabel}
        </button>
      </div>

      {purchased && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative max-h-[82vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-3 shadow-modal dark:bg-night-900 sm:p-4">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setPurchased(null)}
                aria-label="Close credentials"
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-night-400 dark:hover:bg-night-800 dark:hover:text-night-100"
              >
                <X size={20} />
              </button>
            </div>

            {purchased.credentials.length > 0 ? (
              <CredentialsList items={purchased.credentials} compact />
            ) : (
              <p className="rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                No credentials were returned in this popup. Check History for the saved order.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
