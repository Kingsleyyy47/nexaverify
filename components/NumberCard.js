"use client";

import { useEffect, useState } from "react";
import ToggleSwitch from "./ToggleSwitch";
import ConfirmDialog from "./ConfirmDialog";
import { useCurrency } from "./CurrencyProvider";

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
  const [confirmAutoRenew, setConfirmAutoRenew] = useState(null); // null | true | false

  useEffect(() => {
    if (state.status !== "waiting") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/rentals/status?id=${state.id}`);
        const data = await res.json();
        if (res.ok && data.rental) setState(data.rental);
      } catch {
        // ignore transient poll errors
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [state.status, state.id]);

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
      if (!res.ok) throw new Error(data.error || "Action failed");
      if (data.rental) setState(data.rental);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmAutoRenewChange() {
    const next = confirmAutoRenew;
    setConfirmAutoRenew(null);
    await act("set-auto-renew", { autoRenew: next });
  }

  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="font-mono text-base font-bold">{state.phone_number}</div>
            {state.is_long_term && (
              <div className="flex items-center gap-1.5" title="Auto-renew">
                <ToggleSwitch
                  checked={Boolean(state.auto_renew)}
                  disabled={busy}
                  onChange={() => setConfirmAutoRenew(!state.auto_renew)}
                />
                <span className="text-xs text-gray-500 dark:text-night-400 font-medium">Auto-renew</span>
              </div>
            )}
          </div>
          <div className="text-xs text-gray-400 dark:text-night-400 mt-0.5">
            {state.service_id} · {format(state.price)}
            {state.is_long_term ? " · Long-term" : ""}
          </div>
        </div>
        <span className={`badge shrink-0 ${STATUS_BADGE[state.status] || "badge-neutral"}`}>
          {state.status}
        </span>
      </div>

      {state.sms_code ? (
        <div className="p-3 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-100 dark:border-brand-900 mb-3">
          <div className="text-[11px] uppercase tracking-wide text-brand-600 dark:text-brand-400 font-bold mb-0.5">
            Code
          </div>
          <div className="text-lg font-mono font-bold text-brand-900 dark:text-brand-200">{state.sms_code}</div>
        </div>
      ) : state.status === "waiting" ? (
        <div className="text-xs text-gray-400 dark:text-night-400 mb-3">Waiting for SMS… checking every 5s.</div>
      ) : null}

      {state.is_long_term && state.paid_until && (
        <div className="text-xs text-gray-400 dark:text-night-400 mb-3">
          Paid until {new Date(state.paid_until).toLocaleString()}
          {state.daily_price ? ` · ${format(state.daily_price)}/period` : ""}
        </div>
      )}

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
        {state.is_long_term && (state.status === "done" || state.status === "received") && (
          <button disabled={busy} onClick={() => act("extra")} className="btn-primary btn-sm">
            Request another code
          </button>
        )}
        {state.is_long_term && state.status === "waiting" && (
          <button disabled={busy} onClick={() => act("keep")} className="btn-secondary btn-sm">
            Keep number
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmAutoRenew !== null}
        danger={confirmAutoRenew === true}
        title={confirmAutoRenew ? "Turn on auto-renew?" : "Turn off auto-renew?"}
        message={
          confirmAutoRenew
            ? "DaisySMS will automatically charge to keep this number active as it approaches expiry, and NexaVerify will deduct the matching renewal fee from your wallet balance each time it renews. If your balance is too low when it renews, auto-renew is turned off automatically and this number may expire. By turning this on, you accept responsibility for any renewal charges made while it stays enabled."
            : "This number will no longer renew automatically and may expire at the end of its current paid period."
        }
        confirmLabel={confirmAutoRenew ? "Yes, turn it on" : "Yes, turn it off"}
        cancelLabel="Cancel"
        onConfirm={confirmAutoRenewChange}
        onCancel={() => setConfirmAutoRenew(null)}
      />
    </div>
  );
}
