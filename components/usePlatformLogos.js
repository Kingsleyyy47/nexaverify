"use client";

import { useEffect, useState } from "react";
import { matchPlatformLogo } from "@/lib/platformLogoMatch";

// Shared by every buy list/form (BuyForm, QuickBuyList, UsOnlyBuyList,
// InternationalBuyForm, SocialBoostBuyForm) so each one doesn't repeat its
// own fetch — one request per page load, cached in this hook's own state for
// the lifetime of the component tree that called it. Returns a `logoFor(name)`
// helper instead of the raw list so call sites don't need to import
// lib/platformLogoMatch.js themselves. `logoFor(name)` returns
// `{ logoUrl, logoUrlDark }` (or null) — pass it straight into
// components/AdaptiveLogo.js's `logo` prop for the automatic light/dark
// image swap.
export function usePlatformLogos() {
  const [logos, setLogos] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/platform-logos");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setLogos(data.logos || []);
      } catch {
        // Logos are a cosmetic enhancement — a failed fetch just means no
        // logos render, never a broken buy flow.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function logoFor(name) {
    return matchPlatformLogo(name, logos);
  }

  return { logos, logoFor };
}
