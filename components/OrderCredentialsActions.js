"use client";

import { useState } from "react";
import { Copy, Check, Download } from "lucide-react";

// Order Details page interactivity — copy/download for the whole order, plus
// a copy button per credential field. Deliberately NO "Login" button: this
// feature has no single login URL to send anyone to (unlike a phone-number
// rental), and the customer explicitly asked for it to be removed from this
// screen.
function buildCredentialsText(order, items) {
  const lines = [`Product: ${order.template_name}`, `Items: ${items.length}`, ""];
  items.forEach((item, idx) => {
    lines.push(`#${idx + 1}`);
    if (item.username) lines.push(`ID: ${item.username}`);
    if (item.email) lines.push(`Email: ${item.email}`);
    lines.push(`Password: ${item.password}`);
    if (item.two_fa) lines.push(`2FA Key: ${item.two_fa}`);
    if (item.email_password) lines.push(`Mail Pass: ${item.email_password}`);
    if (item.recovery_email) lines.push(`Recovery Email: ${item.recovery_email}`);
    if (item.recovery_email_password) lines.push(`Recovery Email Pass: ${item.recovery_email_password}`);
    if (item.year) lines.push(`Year: ${item.year}`);
    if (item.friends_count) lines.push(`Friends: ${item.friends_count}`);
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

function FieldRow({ label, value, color }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — value is still visible on screen
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-[11px] uppercase tracking-wide font-bold shrink-0 ${color}`}>{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm font-mono truncate">{value}</span>
        <button
          onClick={handleCopy}
          aria-label={`Copy ${label}`}
          className="shrink-0 p-1 rounded text-gray-400 dark:text-night-500 hover:text-brand-600 dark:hover:text-brand-400"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

export function CredentialsList({ items }) {
  return (
    <div className="space-y-3">
      {items.map((item, idx) => {
        const fields = [
          { label: "ID", value: item.username || item.email, color: "text-gray-900 dark:text-night-100" },
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
        ].filter((f) => f.value);

        return (
          <div key={item.id} className="rounded-xl border border-gray-100 dark:border-night-700 p-4">
            <span className="inline-flex w-6 h-6 rounded-full bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-300 text-xs font-bold items-center justify-center mb-2">
              {idx + 1}
            </span>
            <div className="space-y-1.5">
              {fields.map((f) => (
                <FieldRow key={f.label} label={f.label} value={f.value} color={f.color} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
