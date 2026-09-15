"use client";

import { useState } from "react";
import LocalDateTime from "./LocalDateTime";

// Same expand-in-place "Details" pattern as AdminProductHistory.js's
// PurchaseRow — one row per error_logs entry, collapsed by default, showing
// the real underlying error (stack trace, provider raw response, extra
// context) only when an admin explicitly asks for it. This is the ONLY
// place in the app any of that ever renders — every customer-facing surface
// only ever shows `log.reference_id` wrapped in a generic message (see
// lib/errorLog.js, lib/apiError.js).
function DetailField({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="font-bold uppercase tracking-wide text-gray-400 dark:text-night-500 shrink-0">{label}</span>
      <pre className="text-gray-700 dark:text-night-200 whitespace-pre-wrap break-all font-mono bg-white dark:bg-night-900 rounded-md p-2 mt-0.5 max-h-64 overflow-y-auto">
        {String(value)}
      </pre>
    </div>
  );
}

export default function AdminNotificationRow({ log, userLabel }) {
  const [open, setOpen] = useState(false);
  const raw = log.raw || {};
  const hasContext = log.context && Object.keys(log.context).length > 0;

  return (
    <div className="border-b border-gray-50 dark:border-night-800 last:border-0 px-4 py-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-mono font-bold text-sm dark:text-night-100">{log.reference_id}</div>
          <div className="text-xs text-gray-400 dark:text-night-400 mt-0.5">
            {log.route || "—"} · {userLabel} · <LocalDateTime value={log.created_at} />
          </div>
          <p className="text-sm text-gray-600 dark:text-night-300 mt-1.5 break-words">{log.message}</p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="btn-secondary btn-sm shrink-0">
          {open ? "Hide" : "Details"}
        </button>
      </div>
      {open && (
        <div className="mt-3 rounded-lg bg-gray-50 dark:bg-night-800 p-3 space-y-2.5">
          <DetailField label="Error name / code" value={[raw.name, raw.code].filter(Boolean).join(" · ")} />
          <DetailField
            label="Provider raw response"
            value={raw.providerRaw ? JSON.stringify(raw.providerRaw, null, 2) : null}
          />
          <DetailField label="Stack trace" value={raw.stack} />
          {hasContext && <DetailField label="Context" value={JSON.stringify(log.context, null, 2)} />}
        </div>
      )}
    </div>
  );
}
