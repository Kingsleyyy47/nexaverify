import "server-only";
import { NextResponse } from "next/server";
import { logError, customerErrorMessage } from "@/lib/errorLog";

// The standard way for a Route Handler's catch block to respond to an
// unexpected failure: log the REAL error (with a reference ID, via
// lib/errorLog.js) and return only a generic, safe message + that reference
// ID to the client. Never pass `err.message`, a provider's raw response
// text, or a stack trace straight through to NextResponse.json — that's
// exactly the class of bug this exists to close off (a blocked/challenged
// provider response getting parsed and shown/stored raw — see the Sept 2026
// incident where a Cloudflare CSP fragment ended up displayed as a
// customer's phone number).
//
// Usage: `return safeErrorResponse(err, { route: "/api/rentals/buy", userId: user?.id });`
export async function safeErrorResponse(err, { route, userId = null, status = 500, context = null } = {}) {
  const referenceId = await logError({ error: err, route, userId, context });
  return NextResponse.json({ error: customerErrorMessage(referenceId), referenceId }, { status });
}

// For the handful of routes that let an admin see the real provider error
// (useful while testing a provider integration) but must never show it to
// an ordinary customer — logs the error either way (so it's always in Admin
// > Notifications with a reference ID) and returns the raw message only for
// the admin caller, a generic message + that reference ID otherwise.
// Usage: `error: await customerSafeMessage(err, { isAdminCaller, route: "...", userId: user.id })`
export async function customerSafeMessage(err, { isAdminCaller, route, userId = null, context = null } = {}) {
  const referenceId = await logError({ error: err, route, userId, context });
  return isAdminCaller ? (err?.message || "Unknown error") : customerErrorMessage(referenceId);
}
