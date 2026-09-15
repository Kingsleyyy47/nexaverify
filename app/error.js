"use client";

import { useEffect, useState } from "react";

// Next.js App Router error boundary — automatically wraps every page/layout
// below the root layout (NOT the root layout itself; see global-error.js for
// that). Catches any rendering error and shows a generic message + a short
// reference ID instead of ever letting a raw error/stack trace reach the
// customer. The real error is logged server-side via /api/log-client-error
// (this file itself is a Client Component and has no service-role access),
// and shows up on the admin Notifications page keyed by that same reference
// ID.
export default function ErrorBoundary({ error, reset }) {
  const [referenceId, setReferenceId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/log-client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error?.message,
        stack: error?.stack,
        digest: error?.digest,
        route: typeof window !== "undefined" ? window.location.pathname : null,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.referenceId) setReferenceId(data.referenceId);
      })
      .catch(() => {
        // Logging itself failing is a last-resort no-op — the customer still
        // sees the generic message below, just without a reference ID.
      });
    return () => {
      cancelled = true;
    };
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <h2 className="text-lg font-bold mb-2 dark:text-night-100">Something went wrong</h2>
        <p className="text-sm text-gray-500 dark:text-night-400">
          Please contact support{referenceId ? " with the error below" : ""}.
        </p>
        {referenceId && (
          <p className="text-xs font-mono bg-gray-100 dark:bg-night-800 dark:text-night-200 rounded-lg px-3 py-2 inline-block mt-3 mb-1">
            {referenceId}
          </p>
        )}
        <div className="mt-5">
          <button type="button" onClick={() => reset()} className="btn-primary btn-sm">
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
