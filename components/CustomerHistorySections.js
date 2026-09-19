"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useCurrency } from "./CurrencyProvider";
import { safePhoneNumber } from "@/lib/phoneDisplay";

const RENTAL_STATUS_BADGE = {
  waiting: "badge-warning",
  received: "badge-success",
  done: "badge-neutral",
  cancelled: "badge-danger",
  expired: "badge-danger",
};

const TELEGRAM_STATUS_BADGE = {
  pending: "badge-warning",
  processing: "badge-warning",
  completed: "badge-success",
  failed: "badge-danger",
};

function formatDate(value) {
  return value ? new Date(value).toLocaleString("en-US") : "-";
}

function StatusBadge({ status, map = {} }) {
  return <span className={`badge ${map[status] || "badge-neutral"}`}>{status || "completed"}</span>;
}

function AccordionSection({ title, count, children, defaultOpen = false }) {
  return (
    <details className="card overflow-hidden group" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div>
          <h3 className="font-bold text-[15px]">{title}</h3>
          <p className="text-xs text-gray-400 dark:text-night-400">{count} item{count === 1 ? "" : "s"}</p>
        </div>
        <ChevronDown size={18} className="text-gray-400 dark:text-night-400 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-gray-100 dark:border-night-700 px-4 py-4">{children}</div>
    </details>
  );
}

function EmptyState({ children }) {
  return <p className="py-5 text-center text-sm text-gray-400 dark:text-night-400">{children}</p>;
}

function OrderCard({
  title,
  subtitle,
  description,
  date,
  status,
  statusMap,
  amount,
  actionHref,
  actionLabel,
  onCancel,
  cancelling,
  cancelError,
}) {
  const { format } = useCurrency();

  return (
    <div className="rounded-lg border border-gray-100 dark:border-night-700 p-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-bold text-sm break-all dark:text-night-100">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-gray-400 dark:text-night-400 break-all">{subtitle}</div>}
          {description && (
            <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-night-300 break-all">{description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
          <StatusBadge status={status} map={statusMap} />
          {amount != null && <span className="text-sm font-bold dark:text-night-100">{format(amount)}</span>}
        </div>
      </div>
      {cancelError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{cancelError}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400 dark:text-night-400">
        <span>{formatDate(date)}</span>
        <div className="flex items-center gap-3">
          {/* Rentals still waiting for a code (or, equivalently, still
              "loading" on screen) can be cancelled straight from history —
              same atomic cancel+refund route the dashboard's active-number
              card uses (app/api/rentals/cancel), just reachable from here
              too instead of only from the still-open purchase screen. */}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="btn-secondary btn-sm"
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          )}
          {actionHref && (
            <Link href={actionHref} className="inline-flex items-center gap-1 font-semibold text-brand-700 dark:text-brand-400">
              {actionLabel || "Order details"} <ExternalLink size={13} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function TransactionRow({ transaction }) {
  const { format } = useCurrency();
  const positive = Number(transaction.amount) >= 0;

  return (
    <div className="grid gap-2 rounded-lg border border-gray-100 dark:border-night-700 p-3.5 text-sm sm:grid-cols-[0.8fr_1.4fr_1fr_0.8fr_0.8fr] sm:items-center">
      <div className="font-semibold capitalize dark:text-night-100">{transaction.type?.replace("_", " ")}</div>
      <div className="text-gray-500 dark:text-night-300 break-all">{transaction.note || "-"}</div>
      <div className="text-xs text-gray-400 dark:text-night-400">{formatDate(transaction.created_at)}</div>
      <div className={`font-bold sm:text-right ${positive ? "text-brand-600 dark:text-brand-400" : "text-red-500 dark:text-red-400"}`}>
        {positive ? "+" : ""}
        {format(transaction.amount)}
      </div>
      <div className="text-gray-500 dark:text-night-400 sm:text-right">{format(transaction.balance_after)}</div>
    </div>
  );
}

function buildUnifiedOrders({ rentals, digitalOrders, telegramOrders, socialBoostOrders, rentalCancelState = {}, onCancelRental }) {
  return [
    ...(rentals || []).map((order) => {
      const cancelState = rentalCancelState[order.id] || {};
      // Only ever offered while still "waiting" (i.e. still loading/no code
      // yet) — once a code has arrived, is done, or is already
      // cancelled/expired, the provider cancel call itself would just reject
      // it (see app/api/rentals/cancel), so the button doesn't even render.
      const canCancel = order.status === "waiting";
      return {
        id: `rental-${order.id}`,
        date: order.created_at,
        node: (
          <OrderCard
            title={order.service_name || order.service_id || "SMS rental"}
            subtitle={[
              safePhoneNumber(order.phone_number),
              order.country_name,
              order.is_long_term ? "Long-term" : "Short-term",
            ].filter(Boolean).join(" · ")}
            description={order.full_text || (order.sms_code ? `Code: ${order.sms_code}` : null)}
            date={order.created_at}
            status={order.status}
            statusMap={RENTAL_STATUS_BADGE}
            amount={order.price}
            onCancel={canCancel ? () => onCancelRental(order.id) : null}
            cancelling={cancelState.cancelling}
            cancelError={cancelState.error}
          />
        ),
      };
    }),
    ...(digitalOrders || []).map((order) => ({
      id: `digital-${order.id}`,
      date: order.created_at,
      node: (
        <OrderCard
          title={order.template_name || "Log"}
          subtitle={[
            order.category_name,
            `${order.quantity} credential${order.quantity === 1 ? "" : "s"}`,
          ].filter(Boolean).join(" · ")}
          description={order.template_description}
          date={order.created_at}
          status="completed"
          statusMap={{ completed: "badge-success" }}
          amount={order.total_ngn}
          actionHref={`/digital-accounts/orders/${order.id}`}
          actionLabel="Order details"
        />
      ),
    })),
    ...(telegramOrders || []).map((order) => {
      const product =
        order.order_type === "premium"
          ? `${order.months}-month Telegram Premium`
          : `${order.quantity} Telegram Stars`;
      return {
        id: `telegram-${order.id}`,
        date: order.created_at,
        node: (
          <OrderCard
            title={product}
            subtitle={`@${order.recipient_username}`}
            // Never render telegram_gift_orders.error_message directly — it's
            // populated with raw text in a few places (a wallet-debit error's
            // .message, iStar's own raw failure text) that were never meant
            // for a customer's screen. A failed order just says "failed";
            // anything else needing investigation goes through Admin >
            // Notifications like every other error in this app.
            description={order.status === "failed" ? "This order failed — contact support if you were charged." : null}
            date={order.created_at}
            status={order.status}
            statusMap={TELEGRAM_STATUS_BADGE}
            amount={order.price}
          />
        ),
      };
    }),
    ...(socialBoostOrders || []).map((order) => ({
      id: `social-${order.id}`,
      date: order.created_at,
      node: (
        <OrderCard
          title={order.service_name || `Social Boost service #${order.service_id}`}
          subtitle={`${order.quantity} units${order.link ? ` · ${order.link}` : ""}`}
          description={
            order.refund_needs_review
              ? "Cancelled — refund pending review"
              : order.cancel_requested_at
              ? "Cancelled"
              : null
          }
          date={order.created_at}
          status={order.status}
          amount={order.price_ngn}
        />
      ),
    })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

export default function CustomerHistorySections({
  rentals = [],
  digitalOrders = [],
  telegramOrders = [],
  socialBoostOrders = [],
  transactions = [],
}) {
  // Local overrides so a cancel here updates the card in place (status badge,
  // cancel button disappearing) without needing a full page reload — same
  // rental rows passed in from the server, just patched with whatever
  // /api/rentals/cancel returns.
  const [rentalOverrides, setRentalOverrides] = useState({});
  const [rentalCancelState, setRentalCancelState] = useState({});

  const effectiveRentals = rentals.map((r) => ({ ...r, ...(rentalOverrides[r.id] || {}) }));

  async function handleCancelRental(rentalId) {
    setRentalCancelState((prev) => ({ ...prev, [rentalId]: { cancelling: true, error: "" } }));
    try {
      const res = await fetch("/api/rentals/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rentalId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not cancel this rental.");
      if (data.rental) setRentalOverrides((prev) => ({ ...prev, [rentalId]: data.rental }));
      setRentalCancelState((prev) => ({ ...prev, [rentalId]: { cancelling: false, error: data.error || "" } }));
    } catch (err) {
      setRentalCancelState((prev) => ({ ...prev, [rentalId]: { cancelling: false, error: err.message } }));
    }
  }

  const unifiedOrders = buildUnifiedOrders({
    rentals: effectiveRentals,
    digitalOrders,
    telegramOrders,
    socialBoostOrders,
    rentalCancelState,
    onCancelRental: handleCancelRental,
  });

  return (
    <div className="space-y-4">
      <AccordionSection title="Order history" count={unifiedOrders.length} defaultOpen>
        {unifiedOrders.length === 0 ? (
          <EmptyState>No orders yet.</EmptyState>
        ) : (
          <div className="space-y-3">{unifiedOrders.map((order) => <div key={order.id}>{order.node}</div>)}</div>
        )}
      </AccordionSection>

      <AccordionSection title="Wallet transactions" count={transactions.length}>
        {transactions.length === 0 ? (
          <EmptyState>No transactions yet.</EmptyState>
        ) : (
          <div className="space-y-3">{transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}</div>
        )}
      </AccordionSection>
    </div>
  );
}
