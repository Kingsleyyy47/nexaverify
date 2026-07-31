"use client";

import Link from "next/link";
import { CURRENCIES, CURRENCY_SYMBOLS, convertFromNgn, formatMoney } from "@/lib/currency";
import { useCurrency } from "./CurrencyProvider";

export default function WalletBalanceCard({ balance }) {
  const { currency, rateMap } = useCurrency();

  return (
    <div className="card card-pad bg-gradient-to-br from-brand-800 to-brand-500 text-white border-0">
      <div className="text-sm text-white/70 font-semibold mb-2">Wallet balance</div>
      <div className="text-4xl font-bold mb-1">
        {formatMoney(convertFromNgn(balance, currency, rateMap), currency)}
      </div>
      {currency !== "NGN" && (
        <div className="text-xs text-white/60 mb-5">
          ({formatMoney(balance, "NGN")} — NexaVerify always settles in Naira)
        </div>
      )}

      <div className="flex flex-wrap gap-4 mt-5 pt-5 border-t border-white/15">
        {CURRENCIES.map((c) => (
          <div key={c}>
            <div className="text-[11px] uppercase tracking-wide text-white/50 font-bold">
              {CURRENCY_SYMBOLS[c]} {c}
            </div>
            <div className="text-sm font-semibold">
              {formatMoney(convertFromNgn(balance, c, rateMap), c)}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-6">
        <Link href="/topup" className="btn-secondary btn-sm">
          Top up
        </Link>
        <Link href="/history" className="btn-secondary btn-sm">
          View history
        </Link>
      </div>
    </div>
  );
}
