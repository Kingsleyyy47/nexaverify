"use client";

import { useEffect } from "react";

// Auto "ctrl+shift+r": whichever deployment is live right now can differ
// from the one a tab loaded with (someone left the site open across a
// push). Every 60s, and whenever the tab regains focus/visibility, this
// checks /api/build-version (never cached — see that route) against
// window.__NEXA_BUILD_ID__ (stamped into the HTML at render time, see
// app/layout.js). A mismatch means a new version has shipped, so it forces
// a hard reload — no one has to know to hard-refresh manually.
const CHECK_INTERVAL_MS = 60_000;

export default function VersionWatcher() {
  useEffect(() => {
    let stopped = false;

    async function checkVersion() {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/build-version", { cache: "no-store" });
        const data = await res.json();
        const currentVersion = window.__NEXA_BUILD_ID__;
        if (data.version && currentVersion && data.version !== currentVersion) {
          window.location.reload();
        }
      } catch {
        // Offline or a transient network blip — just try again next tick,
        // no need to bother anyone about it.
      }
    }

    const interval = setInterval(checkVersion, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", checkVersion);
    window.addEventListener("focus", checkVersion);

    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", checkVersion);
      window.removeEventListener("focus", checkVersion);
    };
  }, []);

  return null;
}
