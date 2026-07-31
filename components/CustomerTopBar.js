"use client";

import { useCurrency } from "./CurrencyProvider";
import CurrencySwitcher from "./CurrencySwitcher";
import ThemeToggle from "./ThemeToggle";

// Sits at the top of every customer page: balance in the visitor's chosen
// display currency, the currency switcher (₦ / $ / £ / €), and the
// light/dark toggle. `balance` is always the real NGN number from the
// profile — this component just converts it for display.
//
// On mobile, the currency switcher + theme toggle live in the header bar
// (CustomerSidebar's mobile top bar) instead, to keep this row from getting
// cramped next to the wallet balance — so they're hidden here below the md
// breakpoint and only show at md+ where there's room for both.
export default function CustomerTopBar({ balance }) {
  const { format } = useCurrency();

  return (
    <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-night-800">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold">
          Wallet balance
        </div>
        <div className="text-lg font-bold dark:text-night-100">{format(balance)}</div>
      </div>
      <div className="hidden md:flex items-center gap-2">
        <CurrencySwitcher />
        <ThemeToggle />
      </div>
    </div>
  );
}
