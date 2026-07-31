import { NextResponse } from "next/server";

// REMOVED (2026-07-31): this called DaisySMS's `setAutoRenew` action, which
// isn't documented in .io's real published API (daisysms.io/docs/api) —
// unverified against this account and likely non-functional. The
// customer-facing auto-renew toggle has been removed from NumberCard.js and
// the purchase flow no longer offers it. Kept as a 410 rather than deleted
// outright so any stale client reference fails loudly instead of silently.
export async function POST() {
  return NextResponse.json(
    { error: "Auto-renew is not available." },
    { status: 410 }
  );
}
