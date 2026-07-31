import { NextResponse } from "next/server";

// REMOVED (2026-07-31): this called DaisySMS's `keep` action, which isn't
// documented in .io's real published API (daisysms.io/docs/api) —
// unverified against this account and likely non-functional. The
// customer-facing "Keep number" button has been removed from NumberCard.js.
// Kept as a 410 rather than deleted outright so any stale client reference
// fails loudly instead of silently.
export async function POST() {
  return NextResponse.json(
    { error: "This action is not available." },
    { status: 410 }
  );
}
