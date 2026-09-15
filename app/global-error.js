"use client";

import { useEffect, useState } from "react";

// Same idea as app/error.js, but for an error thrown by the ROOT layout
// itself — Next.js requires this file to render its own <html>/<body> since
// there's no surrounding layout left to fall back on at that point, so it
// can't reuse globals.css/Tailwind classes reliably and uses inline styles
// instead. Still routes through the exact same /api/log-client-error ->
// error_logs -> admin Notifications pipeline as every other error path.
export default function GlobalError({ error, reset }) {
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
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 360 }}>
            <h2 style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, color: "#111827" }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
              Please contact support{referenceId ? " with the error below" : ""}.
            </p>
            {referenceId && (
              <p
                style={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  background: "#f3f4f6",
                  color: "#111827",
                  borderRadius: 8,
                  padding: "8px 12px",
                  display: "inline-block",
                  marginTop: 12,
                  marginBottom: 4,
                }}
              >
                {referenceId}
              </p>
            )}
            <div style={{ marginTop: 20 }}>
              <button
                type="button"
                onClick={() => reset()}
                style={{
                  background: "#0f766e",
                  color: "#fff",
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "none",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
