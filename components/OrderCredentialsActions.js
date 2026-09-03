"use client";

import { useState } from "react";
import { Copy, Check, Download } from "lucide-react";

// Order Details page interactivity — copy/download for the whole order, plus
// a copy button per credential field. Deliberately NO "Login" button: this
// feature has no single login URL to send anyone to (unlike a phone-number
// rental), and the customer explicitly asked for it to be removed from this
// screen.
function buildCredentialsText(order, items) {
  const lines = [];
  const add = (label, value) => {
    if (value === undefined || value === null || value === "") return;
    lines.push(`${label}: ${String(value)}`);
  };

  add("Order ID", order.id);
  add("Product", order.template_name);
  add("Description", order.template_description);
  add("Category", order.category_name);
  add("Quantity", order.quantity || items.length);
  add("Total", order.total_ngn != null ? `₦${Number(order.total_ngn).toLocaleString("en-US")}` : null);
  add("Purchased At", order.created_at ? new Date(order.created_at).toLocaleString("en-US") : null);
  lines.push("");

  items.forEach((item, idx) => {
    lines.push(`#${idx + 1}`);
    add("Username", item.username);
    add("Email", item.email);
    add("Password", item.password);
    add("2FA Key", item.two_fa);
    add("Mail Pass", item.email_password);
    add("Recovery Email", item.recovery_email);
    add("Recovery Email Pass", item.recovery_email_password);
    add("Year", item.year);
    add("Friends", item.friends_count);
    add("Extra / Cookies", item.extra_data);
    lines.push("");
  });
  return lines.join("\n");
}

export function OrderTopActions({ order, items }) {
  const [copied, setCopied] = useState(false);

  async function handleCopyAll() {
    try {
      await navigator.clipboard.writeText(buildCredentialsText(order, items));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard can fail silently (permissions/insecure context) — the
      // per-field copy buttons below still work.
    }
  }

  function handleDownload() {
    const blob = new Blob([buildCredentialsText(order, items)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `order-${order.id}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      <button onClick={handleCopyAll} className="btn-secondary btn-sm flex items-center gap-1.5">
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy"}
      </button>
      <button onClick={handleDownload} className="btn-secondary btn-sm flex items-center gap-1.5">
        <Download size={14} /> Download
      </button>
    </div>
  );
}

function FieldRow({ label, value, color, compact = false }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — value is still visible on screen
    }
  }

  return (
    <div className={`min-w-0 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between ${compact ? "sm:gap-2" : "sm:gap-3"}`}>
      <span className={`${compact ? "text-[10px]" : "text-[11px]"} uppercase tracking-wide font-bold shrink-0 ${color}`}>{label}</span>
      <div className="flex w-full min-w-0 items-start gap-1.5 sm:justify-end">
        <span className={`block min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-gray-700 dark:text-night-200 ${compact ? "text-xs" : "text-sm"}`}>
          {value}
        </span>
        <button
          onClick={handleCopy}
          aria-label={`Copy ${label}`}
          className="shrink-0 -mt-1 p-1 rounded text-gray-400 dark:text-night-500 hover:text-brand-600 dark:hover:text-brand-400"
        >
            {copied ? <Check size={compact ? 12 : 13} /> : <Copy size={compact ? 12 : 13} />}
        </button>
      </div>
    </div>
  );
}

export function CredentialsList({ items, compact = false }) {
  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {items.map((item, idx) => {
        const fields = [
          { label: "Username", value: item.username, color: "text-gray-900 dark:text-night-100" },
          { label: "Password", value: item.password, color: "text-red-600 dark:text-red-400" },
          { label: "2FA Key", value: item.two_fa, color: "text-purple-600 dark:text-purple-400" },
          { label: "Email", value: item.email, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Mail Pass", value: item.email_password, color: "text-amber-600 dark:text-amber-400" },
          { label: "Recovery Email", value: item.recovery_email, color: "text-sky-600 dark:text-sky-400" },
          {
            label: "Recovery Mail Pass",
            value: item.recovery_email_password,
            color: "text-orange-600 dark:text-orange-400",
          },
          { label: "Year", value: item.year, color: "text-teal-600 dark:text-teal-400" },
          { label: "Friends", value: item.friends_count, color: "text-indigo-600 dark:text-indigo-400" },
          {
            label: "Extra / Cookies",
            value: item.extra_data,
            color: "text-gray-500 dark:text-night-400",
          },
        ].filter((f) => f.value);

        return (
          <div key={item.id} className={`min-w-0 rounded-lg border border-gray-100 dark:border-night-700 ${compact ? "p-3" : "p-4"}`}>
            <span className={`inline-flex rounded-full bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-300 text-xs font-bold items-center justify-center ${compact ? "mb-1.5 h-5 w-5" : "mb-2 h-6 w-6"}`}>
              {idx + 1}
            </span>
            <div className={compact ? "space-y-1" : "space-y-1.5"}>
              {fields.map((f) => (
                <FieldRow key={f.label} label={f.label} value={f.value} color={f.color} compact={compact} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
