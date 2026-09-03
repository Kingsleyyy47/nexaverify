"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, PackageCheck, Plus, ShieldCheck, X, Zap } from "lucide-react";
import AdaptiveLogo from "./AdaptiveLogo";
import { CredentialsList } from "./OrderCredentialsActions";

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900";
const QUICK_QUANTITIES = [1, 2, 5, 10];

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

  function setQuantityNumber(nextQuantity) {
    if (outOfStock) return;
    const clamped = Math.max(1, Math.min(nextQuantity, template.availableCount));
    setQuantity(String(clamped));
  }

  function stepQuantity(delta) {
    const current = quantityIsValid ? quantityNumber : 0;
    setQuantityNumber(current + delta);
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
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card dark:border-night-700 dark:bg-night-900">
        <div className="border-b border-gray-100 bg-gradient-to-br from-brand-50 via-white to-sky-50 p-3 dark:border-night-700 dark:from-night-900 dark:via-night-900 dark:to-night-800 sm:p-4">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-brand-100 bg-white/80 px-3 py-2 dark:border-night-700 dark:bg-night-950/70">
              <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-night-400">
                <PackageCheck size={12} /> Stock
              </div>
              <div className="text-sm font-bold">{template.availableCount.toLocaleString("en-US")} pcs</div>
            </div>
            <div className="rounded-lg border border-brand-100 bg-white/80 px-3 py-2 dark:border-night-700 dark:bg-night-950/70">
              <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-night-400">
                <Zap size={12} /> Release
              </div>
              <div className="text-sm font-bold">Instant</div>
            </div>
          </div>

          <div className="flex items-start gap-3">
              {template.logoUrl ? (
                <AdaptiveLogo
                  logo={{ logoUrl: template.logoUrl, logoUrlDark: template.logoUrlDark }}
                  className="h-10 w-10 shrink-0 rounded-lg sm:h-11 sm:w-11"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 ring-1 ring-gray-100 dark:bg-night-800 dark:text-brand-300 dark:ring-night-700 sm:h-11 sm:w-11">
                  <PackageCheck size={20} />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="badge badge-success">{template.categoryName}</span>
                  <span className={`badge ${outOfStock ? "badge-danger" : "badge-neutral"}`}>
                    {outOfStock ? "Sold out" : `${template.availableCount} available`}
                  </span>
                </div>
                <h1 className="break-words text-lg font-bold leading-tight text-gray-950 dark:text-night-100 sm:text-xl">
                  {template.name}
                </h1>
                {template.description && (
                  <p className="mt-1.5 line-clamp-2 break-words text-xs leading-5 text-gray-600 dark:text-night-300">
                    {template.description}
                  </p>
                )}
              </div>
            </div>
        </div>

        <div className="space-y-3 p-3 sm:p-4">
          <div className="rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-800 dark:bg-brand-900 dark:text-brand-200">
            <div className="flex items-center gap-2 font-bold">
              <ShieldCheck size={15} /> Private credentials
            </div>
            <p className="mt-0.5 text-xs leading-4 text-brand-700 dark:text-brand-300">
              Username, password, 2FA and mail fields appear immediately after purchase.
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-500 dark:text-night-400">Price per account</div>
            <div className="mt-0.5 text-2xl font-bold text-gray-950 dark:text-night-100">
              ₦{template.priceNgn.toLocaleString("en-US")}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-bold">Quantity</label>
              <div className="grid grid-cols-[2.5rem_1fr_2.5rem] gap-2">
                <button
                  type="button"
                  onClick={() => stepQuantity(-1)}
                  disabled={outOfStock || !quantityIsValid || quantityNumber <= 1}
                  aria-label="Decrease quantity"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-night-600 dark:bg-night-950 dark:text-night-300 dark:hover:border-brand-400 dark:hover:bg-night-800"
                >
                  <Minus size={16} />
                </button>
                <input
                  type="number"
                  min={1}
                  max={Math.max(template.availableCount, 1)}
                  value={quantity}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  disabled={outOfStock}
                  className={`${INPUT_CLASS} h-10 text-center text-base font-bold disabled:opacity-50 disabled:cursor-not-allowed`}
                  placeholder="0"
                />
                <button
                  type="button"
                  onClick={() => stepQuantity(1)}
                  disabled={outOfStock || (quantityIsValid && quantityNumber >= template.availableCount)}
                  aria-label="Increase quantity"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-night-600 dark:bg-night-950 dark:text-night-300 dark:hover:border-brand-400 dark:hover:bg-night-800"
                >
                  <Plus size={16} />
                </button>
              </div>

              {!outOfStock && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {QUICK_QUANTITIES.map((value) => {
                    const disabled = value > template.availableCount;
                    const selected = quantityIsValid && quantityNumber === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setQuantityNumber(value)}
                        disabled={disabled}
                        className={`rounded-lg px-3 py-1 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          selected
                            ? "bg-brand-600 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-brand-50 hover:text-brand-700 dark:bg-night-800 dark:text-night-300 dark:hover:bg-night-700 dark:hover:text-night-100"
                        }`}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-lg border border-gray-100 dark:border-night-700">
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5 dark:border-night-700">
                <span className="text-xs font-semibold text-gray-500 dark:text-night-300">Subtotal</span>
                <span className="text-sm font-bold">
                  {totalNgn == null ? "Enter quantity" : `₦${totalNgn.toLocaleString("en-US")}`}
                </span>
              </div>
              <div className="flex items-center justify-between bg-gray-50 px-3 py-2.5 dark:bg-night-800">
                <span className="text-sm font-bold text-gray-700 dark:text-night-200">You pay</span>
                <span className="text-lg font-bold text-brand-700 dark:text-brand-300">
                  {totalNgn == null ? "₦0" : `₦${totalNgn.toLocaleString("en-US")}`}
                </span>
              </div>
            </div>

            {exceedsStock && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Only {template.availableCount} in stock.
              </p>
            )}
            {insufficientBalance && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Required ₦{totalNgn.toLocaleString("en-US")}; wallet has ₦{walletBalance.toLocaleString("en-US")}.
              </p>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </p>
            )}

            <button
              onClick={handleBuy}
              disabled={!canBuy}
              className="btn-primary w-full py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {buttonLabel}
            </button>
          </div>
        </div>
      </section>

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
