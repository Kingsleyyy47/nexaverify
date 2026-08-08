"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// `config` comes from admin/onboarding/page.js as:
// { enabled, telegramUrl, supportUrl, welcomeTitle, welcomeIntro, buyInstructions, smsCostsText }
export default function OnboardingConfigForm({ config }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(Boolean(config.enabled));
  const [telegramUrl, setTelegramUrl] = useState(config.telegramUrl || "");
  const [supportUrl, setSupportUrl] = useState(config.supportUrl || "");
  const [welcomeTitle, setWelcomeTitle] = useState(config.welcomeTitle || "");
  const [welcomeIntro, setWelcomeIntro] = useState(config.welcomeIntro || "");
  const [buyInstructions, setBuyInstructions] = useState(config.buyInstructions || "");
  const [smsCostsText, setSmsCostsText] = useState(config.smsCostsText || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/onboarding/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          telegramUrl,
          supportUrl,
          welcomeTitle,
          welcomeIntro,
          buyInstructions,
          smsCostsText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save settings");

      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
      <div className="flex items-center justify-between pb-5 border-b border-gray-100 dark:border-night-800">
        <div>
          <span className="font-bold text-sm block">Welcome popup</span>
          <span className="text-xs text-gray-400 dark:text-night-400">
            Shown once to each customer the first time they reach the dashboard.
          </span>
        </div>
        <div className="flex rounded-lg bg-gray-100 dark:bg-night-800 p-0.5 text-xs font-semibold shrink-0 ml-3">
          <button
            type="button"
            onClick={() => setEnabled(false)}
            className={`px-2.5 py-1 rounded-md transition ${
              !enabled
                ? "bg-white dark:bg-night-900 text-brand-700 dark:text-brand-400 shadow-sm"
                : "text-gray-500 dark:text-night-400"
            }`}
          >
            Off
          </button>
          <button
            type="button"
            onClick={() => setEnabled(true)}
            className={`px-2.5 py-1 rounded-md transition ${
              enabled
                ? "bg-white dark:bg-night-900 text-brand-700 dark:text-brand-400 shadow-sm"
                : "text-gray-500 dark:text-night-400"
            }`}
          >
            On
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="field">
          <label htmlFor="telegram-url">Telegram channel link</label>
          <input
            id="telegram-url"
            type="url"
            value={telegramUrl}
            onChange={(e) => setTelegramUrl(e.target.value)}
            placeholder="https://t.me/yourchannel"
          />
          <span className="hint">Leave blank to hide the Telegram button.</span>
        </div>
        <div className="field">
          <label htmlFor="support-url">Support link</label>
          <input
            id="support-url"
            type="url"
            value={supportUrl}
            onChange={(e) => setSupportUrl(e.target.value)}
            placeholder="https://t.me/yoursupport"
          />
          <span className="hint">Leave blank to hide the Support button.</span>
        </div>
      </div>

      <div className="field">
        <label htmlFor="welcome-title">Title</label>
        <input
          id="welcome-title"
          type="text"
          required
          value={welcomeTitle}
          onChange={(e) => setWelcomeTitle(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="welcome-intro">Welcome text</label>
        <textarea
          id="welcome-intro"
          required
          rows={2}
          value={welcomeIntro}
          onChange={(e) => setWelcomeIntro(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="buy-instructions">"How to buy SMS units" instructions</label>
        <textarea
          id="buy-instructions"
          required
          rows={3}
          value={buyInstructions}
          onChange={(e) => setBuyInstructions(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="sms-costs-text">"SMS costs" blurb</label>
        <textarea
          id="sms-costs-text"
          required
          rows={2}
          value={smsCostsText}
          onChange={(e) => setSmsCostsText(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {saved && <p className="text-sm text-brand-700 dark:text-brand-400">Settings updated.</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full sm:w-auto">
        {loading ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
