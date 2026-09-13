"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import LocalDateTime from "./LocalDateTime";
import { CredentialsList } from "./OrderCredentialsActions";

const PROVIDER_LABELS = {
  daisysms: "USA & Canada",
  daisysim: "All countries",
  daisysim_usa: "US Only",
};

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

function badgeClassFor(map, status) {
  return map[status] || "badge-neutral";
}

// A closeable dropdown per product category (native <details>, same pattern
// as the customer History page's accordions) — each row is buyer + time +
// what was bought, and a "Details" button that expands the row in place to
// reveal the actual thing the customer got, rather than navigating away.
function CategorySection({ title, description, count, children, defaultOpen = false }) {
  return (
    <details className="card overflow-hidden" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
        <div>
          <h3 className="font-bold text-[15px]">{title}</h3>
          <p className="text-xs text-gray-400 dark:text-night-400 mt-0.5">
            {count} order{count === 1 ? "" : "s"}
            {description ? ` · ${description}` : ""}
          </p>
        </div>
        <ChevronDown size={18} className="text-gray-400 dark:text-night-400 transition" />
      </summary>
      <div className="border-t border-gray-100 dark:border-night-700">{children}</div>
    </details>
  );
}

function EmptyRow({ children }) {
  return <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-night-400">{children}</p>;
}

// One purchase row, generic across every category — `summary` is the "what
// was bought" text, `status`/`statusMap` render the badge, and `detail` is
// whatever JSX should appear when "Details" is expanded for THIS row (built
// differently per category by the caller — see the four *Row components
// below).
function PurchaseRow({ buyerName, date, summary, status, statusMap, amount, detail }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-gray-50 dark:border-night-800 last:border-0 px-4 py-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-bold text-sm dark:text-night-100 break-all">{summary}</div>
          <div className="text-xs text-gray-400 dark:text-night-400 mt-0.5">
            {buyerName} · <LocalDateTime value={date} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status && <span className={`badge ${badgeClassFor(statusMap || {}, status)}`}>{status}</span>}
          {amount != null && (
            <span className="text-sm font-bold dark:text-night-100">
              ₦{Number(amount).toLocaleString("en-US")}
            </span>
          )}
          <button type="button" onClick={() => setOpen((o) => !o)} className="btn-secondary btn-sm">
            {open ? "Hide" : "Details"}
          </button>
        </div>
      </div>
      {open && <div className="mt-3 rounded-lg bg-gray-50 dark:bg-night-800 p-3">{detail}</div>}
    </div>
  );
}

function DetailField({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2 text-xs">
      <span className="font-bold uppercase tracking-wide text-gray-400 dark:text-night-500 shrink-0">{label}</span>
      <span className="text-gray-700 dark:text-night-200 break-all font-mono">{String(value)}</span>
    </div>
  );
}

function RentalRow({ r }) {
  return (
    <PurchaseRow
      buyerName={r.buyerName}
      date={r.created_at}
      summary={`${r.service_name || r.service_id || "SMS rental"} — ${PROVIDER_LABELS[r.provider] || r.provider || "—"}${r.is_long_term ? " (Long-term)" : ""}`}
      status={r.status}
      statusMap={RENTAL_STATUS_BADGE}
      amount={r.price}
      detail={
        <div className="space-y-1.5">
          <DetailField label="Phone number" value={r.phone_number} />
          <DetailField label="SMS code" value={r.sms_code} />
          <DetailField label="Full text" value={r.full_text} />
          <DetailField label="Provider" value={PROVIDER_LABELS[r.provider] || r.provider} />
          <DetailField label="Status" value={r.status} />
          <DetailField label="Cost (USD, provider)" value={r.cost_usd} />
          {r.is_long_term && <DetailField label="Paid until" value={r.paid_until} />}
          {!r.sms_code && !r.full_text && (
            <p className="text-xs text-gray-400 dark:text-night-400">No code received yet.</p>
          )}
        </div>
      }
    />
  );
}

function DigitalOrderRow({ o }) {
  const items = Array.isArray(o.credentials_snapshot) ? o.credentials_snapshot : [];
  return (
    <PurchaseRow
      buyerName={o.buyerName}
      date={o.created_at}
      summary={`${o.template_name || "Digital account"} × ${o.quantity}${o.category_name ? ` — ${o.category_name}` : ""}`}
      status="completed"
      statusMap={{ completed: "badge-success" }}
      amount={o.total_ngn}
      detail={
        items.length > 0 ? (
          <CredentialsList items={items} compact />
        ) : (
          <p className="text-xs text-gray-400 dark:text-night-400">
            No stored credential snapshot for this order.
          </p>
        )
      }
    />
  );
}

function TelegramOrderRow({ o }) {
  const summary =
    o.order_type === "premium" ? `${o.months}-month Telegram Premium` : `${o.quantity} Telegram Stars`;
  return (
    <PurchaseRow
      buyerName={o.buyerName}
      date={o.created_at}
      summary={`${summary} → @${o.recipient_username}`}
      status={o.status}
      statusMap={TELEGRAM_STATUS_BADGE}
      amount={o.price}
      detail={
        <div className="space-y-1.5">
          <DetailField label="Recipient" value={`@${o.recipient_username}`} />
          <DetailField label="Type" value={o.order_type} />
          <DetailField label="Wallet type" value={o.wallet_type} />
          <DetailField label="Provider amount" value={o.provider_amount} />
          <DetailField label="Tx hash" value={o.tx_hash} />
          <DetailField label="Status" value={o.status} />
          <DetailField label="Error" value={o.error_message} />
        </div>
      }
    />
  );
}

function SocialBoostOrderRow({ o }) {
  return (
    <PurchaseRow
      buyerName={o.buyerName}
      date={o.created_at}
      summary={`${o.quantity} × ${o.service_name || `Service #${o.service_id}`}`}
      status={o.status}
      amount={o.price_ngn}
      detail={
        <div className="space-y-1.5">
          <DetailField label="Link" value={o.link} />
          <DetailField label="Start count" value={o.start_count} />
          <DetailField label="Remains" value={o.remains} />
          <DetailField label="Status" value={o.status} />
          <DetailField label="Refill status" value={o.refill_status} />
          <DetailField label="Provider order id" value={o.provider_order_id} />
          <DetailField label="Cancel requested" value={o.cancel_requested_at} />
          <DetailField label="Refunded" value={o.refunded_at} />
          {o.refund_needs_review && <DetailField label="Refund needs review" value={o.cancel_error || "yes"} />}
        </div>
      }
    />
  );
}

export default function AdminProductHistory({
  rentals = [],
  digitalOrders = [],
  telegramOrders = [],
  socialBoostOrders = [],
}) {
  return (
    <div className="space-y-4">
      <CategorySection title="SMS rentals" description="USA & Canada, International, US Only" count={rentals.length} defaultOpen>
        {rentals.length === 0 ? (
          <EmptyRow>No rentals purchased yet.</EmptyRow>
        ) : (
          rentals.map((r) => <RentalRow key={r.id} r={r} />)
        )}
      </CategorySection>

      <CategorySection title="Digital accounts" description="logs" count={digitalOrders.length}>
        {digitalOrders.length === 0 ? (
          <EmptyRow>No digital accounts purchased yet.</EmptyRow>
        ) : (
          digitalOrders.map((o) => <DigitalOrderRow key={o.id} o={o} />)
        )}
      </CategorySection>

      <CategorySection title="Telegram Premium & Stars" count={telegramOrders.length}>
        {telegramOrders.length === 0 ? (
          <EmptyRow>No Telegram orders yet.</EmptyRow>
        ) : (
          telegramOrders.map((o) => <TelegramOrderRow key={o.id} o={o} />)
        )}
      </CategorySection>

      <CategorySection title="Social Boost" count={socialBoostOrders.length}>
        {socialBoostOrders.length === 0 ? (
          <EmptyRow>No Social Boost orders yet.</EmptyRow>
        ) : (
          socialBoostOrders.map((o) => <SocialBoostOrderRow key={o.id} o={o} />)
        )}
      </CategorySection>
    </div>
  );
}
