"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";

// Shows the customer's permanent PocketFi-issued bank account — fund the
// wallet any time by transferring to this account, no checkout redirect
// needed. Created lazily on first load via POST /api/wallet/virtual-account
// (get-or-create), since most customers will only ever need one.
export default function VirtualAccountCard() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/wallet/virtual-account", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not get your account number");
      setAccount(data.account);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCopy() {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account.account_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the number
      // is still selectable/visible on screen either way.
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400 dark:text-night-400">Setting up your account number…</p>;
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={load} className="btn-secondary btn-sm">
          Try again
        </button>
      </div>
    );
  }

  if (!account) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-night-400">
        Transfer any amount to this account any time — your wallet is credited automatically once
        the transfer arrives.
      </p>

      <div className="rounded-xl border border-gray-100 dark:border-night-700 divide-y divide-gray-100 dark:divide-night-700">
        <div className="px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold">
            Bank
          </div>
          <div className="text-sm font-semibold capitalize">{account.bank}</div>
        </div>
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold">
              Account number
            </div>
            <div className="text-lg font-bold tracking-wide">{account.account_number}</div>
          </div>
          <button
            onClick={handleCopy}
            className="btn-secondary btn-sm flex items-center gap-1.5 shrink-0"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold">
            Account name
          </div>
          <div className="text-sm font-semibold">{account.account_name}</div>
        </div>
      </div>
    </div>
  );
}
