"use client";

import { CURRENCIES, CURRENCY_SYMBOLS } from "@/lib/currency";
import { useCurrency } from "./CurrencyProvider";

export default function CurrencySwitcher() {
  const { currency, setCurrency } = useCurrency();

  return (
    <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-night-800 rounded-lg p-0.5">
      {CURRENCIES.map((c) => (
        <button
          key={c}
          onClick={() => setCurrency(c)}
          className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${
            currency === c
              ? "bg-white dark:bg-night-900 text-brand-700 dark:text-brand-400 shadow-sm"
              : "text-gray-500 dark:text-night-400 hover:text-gray-700 dark:hover:text-night-200"
          }`}
        >
          {CURRENCY_SYMBOLS[c]} {c}
        </button>
      ))}
    </div>
  );
}
