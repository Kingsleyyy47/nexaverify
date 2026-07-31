"use client";

import { useCurrency } from "./CurrencyProvider";

export default function TransactionsTable({ transactions, emptyMessage = "No transactions yet." }) {
  const { format } = useCurrency();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 border-b border-gray-100 dark:border-night-700">
            <th className="pb-2.5 font-bold">Type</th>
            <th className="pb-2.5 font-bold">Note</th>
            <th className="pb-2.5 font-bold">Date</th>
            <th className="pb-2.5 font-bold text-right">Amount</th>
            <th className="pb-2.5 font-bold text-right">Balance after</th>
          </tr>
        </thead>
        <tbody>
          {(transactions || []).length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-gray-400 dark:text-night-400">
                {emptyMessage}
              </td>
            </tr>
          )}
          {(transactions || []).map((t) => (
            <tr key={t.id} className="border-b border-gray-50 dark:border-night-700 last:border-0">
              <td className="py-3.5 capitalize dark:text-night-200">{t.type.replace("_", " ")}</td>
              <td className="py-3.5 text-gray-400 dark:text-night-400">{t.note || "—"}</td>
              <td className="py-3.5 text-gray-400 dark:text-night-400">
                {new Date(t.created_at).toLocaleString()}
              </td>
              <td
                className={`py-3.5 text-right font-semibold ${
                  t.amount >= 0 ? "text-brand-600 dark:text-brand-400" : "text-red-500 dark:text-red-400"
                }`}
              >
                {t.amount >= 0 ? "+" : ""}
                {format(t.amount)}
              </td>
              <td className="py-3.5 text-right text-gray-500 dark:text-night-400">
                {format(t.balance_after)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
