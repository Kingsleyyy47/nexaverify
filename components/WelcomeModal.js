"use client";

import { useState } from "react";
import { X, Send, MessageCircle, ListChecks, Wallet, BellOff } from "lucide-react";

// Welcome popup — content comes entirely from public.onboarding_config
// (edited at /admin/onboarding), not hardcoded here, so an admin can change
// the Telegram/support links or copy without touching code.
//
// Kingsley's rule: this now shows on EVERY dashboard visit by default — it's
// no longer a one-time thing. The X and "Get Started" both just close it for
// THIS visit (no network call, nothing persisted) — it'll be back next time.
// The separate "Mute for 24h" button is the only action that persists
// anything: it calls /api/onboarding/mute to set
// profiles.onboarding_muted_until, and the popup stays hidden until that
// passes. `mutedUntil` is passed in from the dashboard server component.
export default function WelcomeModal({ config, mutedUntil }) {
  const isMuted = mutedUntil && new Date(mutedUntil) > new Date();
  const [open, setOpen] = useState(Boolean(config?.enabled) && !isMuted);
  const [muting, setMuting] = useState(false);

  function handleClose() {
    setOpen(false);
  }

  async function handleMute() {
    if (muting) return;
    setMuting(true);
    setOpen(false);
    try {
      await fetch("/api/onboarding/mute", { method: "POST" });
    } catch {
      // Best-effort — don't trap the user behind a failed network call. Worst
      // case it just shows again next visit instead of staying muted, which
      // is harmless.
    }
  }

  if (!open || !config) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-night-900 rounded-xl2 shadow-modal w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-gradient-to-br from-brand-800 to-brand-500 px-6 pt-7 pb-8 text-white shrink-0">
          <button
            onClick={handleClose}
            aria-label="Close — shows again next visit"
            title="Close — shows again next visit"
            className="absolute top-3 right-3 p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <X size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/nexaverify-mark.png" alt="" className="h-10 w-auto mb-4" />
          <h2 className="text-xl font-bold mb-1.5">{config.welcome_title}</h2>
          <p className="text-sm text-white/85 leading-relaxed">{config.welcome_intro}</p>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {(config.telegram_url || config.support_url) && (
            <div className="grid grid-cols-2 gap-2.5">
              {config.telegram_url && (
                <a
                  href={config.telegram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-night-600 px-3 py-2.5 text-sm font-semibold hover:border-brand-300 dark:hover:border-brand-700 transition dark:text-night-100"
                >
                  <Send size={15} className="text-brand-600 dark:text-brand-400" />
                  Telegram
                </a>
              )}
              {config.support_url && (
                <a
                  href={config.support_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-night-600 px-3 py-2.5 text-sm font-semibold hover:border-brand-300 dark:hover:border-brand-700 transition dark:text-night-100"
                >
                  <MessageCircle size={15} className="text-brand-600 dark:text-brand-400" />
                  Support
                </a>
              )}
            </div>
          )}

          <div className="rounded-lg bg-gray-50 dark:bg-night-950 border border-gray-100 dark:border-night-800 px-4 py-3.5">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-night-400 mb-1.5">
              <ListChecks size={14} className="text-brand-600 dark:text-brand-400" />
              How to buy SMS units
            </div>
            <p className="text-sm text-gray-600 dark:text-night-300 leading-relaxed">
              {config.buy_instructions}
            </p>
          </div>

          <div className="rounded-lg bg-gray-50 dark:bg-night-950 border border-gray-100 dark:border-night-800 px-4 py-3.5">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-night-400 mb-1.5">
              <Wallet size={14} className="text-brand-600 dark:text-brand-400" />
              SMS costs
            </div>
            <p className="text-sm text-gray-600 dark:text-night-300 leading-relaxed">
              {config.sms_costs_text}
            </p>
          </div>
        </div>

        <div className="px-6 pb-6 pt-1 shrink-0 space-y-2.5">
          <button onClick={handleClose} className="btn-primary w-full">
            Get Started
          </button>
          <button
            onClick={handleMute}
            disabled={muting}
            title="Hides this popup for 24 hours — it'll come back after that"
            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-night-400 hover:text-gray-600 dark:hover:text-night-200 transition disabled:opacity-50"
          >
            <BellOff size={13} />
            {muting ? "Muting…" : "Don't show for 24 hours"}
          </button>
        </div>
      </div>
    </div>
  );
}
