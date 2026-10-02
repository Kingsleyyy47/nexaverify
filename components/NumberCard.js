"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { useCurrency } from "./CurrencyProvider";
import { RENTAL_TIMEOUT_MINUTES } from "@/lib/rentalTimeout";
import { safePhoneNumber } from "@/lib/phoneDisplay";

const STATUS_BADGE = {
  waiting: "badge-warning",
  received: "badge-success",
  done: "badge-neutral",
  cancelled: "badge-danger",
  expired: "badge-danger",
};

export default function NumberCard({ rental }) {
  const { format } = useCurrency();
  const [state, setState] = useState(rental);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [copied, setCopied] = useState(false);
  const [numberCopied, setNumberCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(null);

  async function copyText(text, setFlag) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setFlag(true);
      setTimeout(() => setFlag(false), 2000);
    } catch {
      // clipboard permission denied or unavailable — silently no-op, the
      // text is still selectable/readable on screen either way.
    }
  }

  useEffect(() => {
    if (state.status !== "waiting") return;

    let stopped = false, timer, failures = 0;
    const controller = new AbortController();
    async function poll() {
      try {
        const res = await fetch(`/api/rentals/status?id=${state.id}`, { cache: "no-store", signal: controller.signal });
        const data = await res.json();
        if (!res.ok || !data.rental) throw new Error("Status unavailable");
        if (!stopped) { setState(data.rental); setPollError(""); failures = 0; }
      } catch {
        if (!stopped && ++failures >= 3) setPollError("Status checks are temporarily unavailable. Retrying automatically; you can also check Rentals.");
      } finally {
        if (!stopped) timer = setTimeout(poll, 5000);
      }
    }
    timer = setTimeout(poll, 5000);
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [state.status, state.id]);

  // Live countdown to when the server-side sweep (see
  // app/api/admin/rentals/sweep-timeouts, runs every minute via pg_cron)
  // will auto-cancel and refund this rental if no code has arrived. Purely
  // a display — this component never cancels anything itself; the backend
  // does, on its own schedule, independent of whether this page is even
  // open. Long-term rentals are excluded, matching the sweep route's own
  // `is_long_term` filter — they're SUPPOSED to sit "waiting" indefinitely.
  useEffect(() => {
    if (state.status !== "waiting" || state.is_long_term || !state.created_at) {
      setSecondsLeft(null);
      return;
    }

    const deadline = new Date(state.created_at).getTime() + RENTAL_TIMEOUT_MINUTES * 60 * 1000;

    function tick() {
      setSecondsLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [state.status, state.is_long_term, state.created_at]);

  async function act(action, extraBody = {}) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/rentals/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rentalId: state.id, ...extraBody }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (action === "extra" && Number.isFinite(data.price)) setState((s) => ({ ...s, extra_price: data.price }));
        throw new Error(data.error || "Action failed");
      }
      if (data.rental) setState(data.rental);
      // Some responses are a 200 with BOTH an updated rental AND an
      // informational error (e.g. "refund still processing", or a code that
      // arrived right as a cancel was requested) — surface that too, not
      // just the rental update.
      if (data.error) setError(data.error);
      else setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-mono text-base font-bold">{safePhoneNumber(state.phone_number)}</div>
            <button
              type="button"
              onClick={() => copyText(safePhoneNumber(state.phone_number), setNumberCopied)}
              title="Copy number"
              className="shrink-0 p-1 rounded-md text-gray-400 dark:text-night-400 hover:text-brand-700 dark:hover:text-brand-400 hover:bg-gray-100 dark:hover:bg-night-800 transition"
            >
              {numberCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <div className="text-xs text-gray-400 dark:text-night-400 mt-0.5">
            {state.service_name || state.service_id} · {format(state.price)}
            {state.country_name ? ` · ${state.country_name}` : ""}
            {state.is_long_term ? " · Long-term" : ""}
          </div>
        </div>
        <span className={`badge shrink-0 ${STATUS_BADGE[state.status] || "badge-neutral"}`}>
          {state.status}
        </span>
      </div>

      {state.sms_code ? (
        <div className="p-3 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-100 dark:border-brand-900 mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-brand-600 dark:text-brand-400 font-bold mb-0.5">
              Code
            </div>
            <div className="text-lg font-mono font-bold text-brand-900 dark:text-brand-200">{state.sms_code}</div>
          </div>
          <button
            type="button"
            onClick={() => copyText(state.sms_code, setCopied)}
            className="btn-secondary btn-sm shrink-0 flex items-center gap-1.5"
          >
            {copied ? (
              <>
                <Check size={14} /> Copied
              </>
            ) : (
              <>
                <Copy size={14} /> Copy
              </>
            )}
          </button>
        </div>
      ) : state.status === "waiting" ? (
        <div className="text-xs text-gray-400 dark:text-night-400 mb-3">
          Waiting for SMS… checking every 5s.
          {secondsLeft != null && (
            <>
              {" "}
              {secondsLeft > 0 ? (
                <>
                  Suggested waiting time:{" "}
                  <span className="font-mono font-semibold text-gray-500 dark:text-night-300">
                    {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:
                    {String(secondsLeft % 60).padStart(2, "0")}
                  </span>{" "}
                  then you can cancel if no code arrives.
                </>
              ) : (
                "You can cancel now. Automatic cancellation is checked after 15 minutes if no code arrives."
              )}
            </>
          )}
        </div>
      ) : null}

      {state.is_long_term && state.paid_until && (
        <div className="text-xs text-gray-400 dark:text-night-400 mb-3">
          Paid until {new Date(state.paid_until).toLocaleString("en-US")}
          {state.daily_price ? ` · ${format(state.daily_price)}/period` : ""}
        </div>
      )}

      {pollError && <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">{pollError}</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {state.status === "waiting" && (
          <button disabled={busy} onClick={() => act("cancel")} className="btn-secondary btn-sm">
            Cancel
          </button>
        )}
        {state.status === "received" && (
          <button disabled={busy} onClick={() => act("done")} className="btn-secondary btn-sm">
            Mark done
          </button>
        )}
        {state.is_long_term && (!state.provider || state.provider === "daisysms") && (state.status === "done" || state.status === "received") && (
          <button disabled={busy} onClick={() => act("extra", { expectedPrice: state.extra_price ?? state.price })} className="btn-primary btn-sm">
            Request another code (up to {format(state.extra_price ?? state.price)})
          </button>
        )}
      </div>
    </div>
  );
}
