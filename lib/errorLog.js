import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Every unexpected error that would otherwise leak something raw to a
// customer (a stack trace, a provider's raw response body, a CSP/HTML
// fragment, a SQL error, etc.) gets logged here instead, keyed by a short
// reference ID the customer CAN see and quote to support. Read only through
// the admin Notifications page (app/admin/notifications/page.js) — see
// supabase/schema.sql's error_logs table for why nothing else can select it.
//
// Never pass this function's return value's underlying `message`/`raw` back
// to a customer — only ever the referenceId, wrapped in
// customerErrorMessage() below.

// No 0/O/1/I — avoids "is that an O or a zero" support back-and-forth.
const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateReferenceId() {
  let s = "";
  for (let i = 0; i < 8; i++) s += REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)];
  return `ERR-${s}`;
}

// Logs one error and returns the reference ID to show the customer.
// Deliberately never throws itself: a failure to reach the DB still returns
// a usable (timestamp-based) reference ID, and both the original error and
// the logging failure land in console.error (Vercel's function logs) as a
// last resort so nothing is silently lost.
export async function logError({ error, route, userId = null, context = null } = {}) {
  const referenceId = generateReferenceId();

  const message =
    (error && typeof error.message === "string" && error.message) ||
    (typeof error === "string" ? error : "Unknown error");

  const raw = {
    name: error?.name,
    code: error?.code,
    stack: error?.stack,
    // Provider wrappers (DaisyError/DaisySimError/GetatextError/etc.)
    // attach the full raw response body here — exactly the kind of detail
    // that must never reach a customer, but is essential for support/admin
    // to actually diagnose what happened.
    providerRaw: error?.raw,
  };

  try {
    const admin = createAdminClient();
    await admin.from("error_logs").insert({
      reference_id: referenceId,
      user_id: userId,
      route: route || null,
      message: String(message).slice(0, 2000),
      raw,
      context,
    });
  } catch (logErr) {
    console.error(`[errorLog] Failed to persist error log ${referenceId} (route: ${route || "?"}):`, logErr);
  }

  console.error(`[${referenceId}]${route ? ` ${route}` : ""}:`, error);

  return referenceId;
}

// The one and only string a customer should ever see for an unexpected
// error — never the real message/raw logged above.
export function customerErrorMessage(referenceId) {
  return `Something went wrong. Please contact support with error ${referenceId}.`;
}
