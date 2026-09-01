"use client";

import { useCurrency } from "./CurrencyProvider";

const STATUS_BADGE = {
  waiting: "badge-warning",
  received: "badge-success",
  done: "badge-neutral",
  cancelled: "badge-danger",
  expired: "badge-danger",
};

export default function OrderHistoryTable({ orders, emptyMessage = "No orders yet." }) {
  const { format } = useCurrency();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 border-b border-gray-100 dark:border-night-700">
            <th className="pb-2.5 font-bold">Service</th>
            <th className="pb-2.5 font-bold">Number</th>
            <th className="pb-2.5 font-bold">Date</th>
            <th className="pb-2.5 font-bold">Status</th>
            <th className="pb-2.5 font-bold text-right">Price</th>
          </tr>
        </thead>
        <tbody>
          {(orders || []).length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-gray-400 dark:text-night-400">
                {emptyMessage}
              </td>
            </tr>
          )}
          {(orders || []).map((o) => (
            <tr key={o.id} className="border-b border-gray-50 dark:border-night-700 last:border-0">
              <td className="py-3.5 dark:text-night-200">
                {o.service_name || o.service_id}
                {o.country_name ? ` · ${o.country_name}` : ""}
              </td>
              <td className="py-3.5 font-mono text-gray-500 dark:text-night-400">{o.phone_number}</td>
              <td className="py-3.5 text-gray-400 dark:text-night-400">
                {new Date(o.created_at).toLocaleString("en-US")}
              </td>
              <td className="py-3.5">
                <span className={`badge ${STATUS_BADGE[o.status] || "badge-neutral"}`}>{o.status}</span>
              </td>
              <td className="py-3.5 text-right font-semibold dark:text-night-200">{format(o.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
