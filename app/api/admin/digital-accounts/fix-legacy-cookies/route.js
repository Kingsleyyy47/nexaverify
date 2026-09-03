import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { looksLikeCookieOrSessionData, looksLikeEmail } from "@/lib/digitalAccountsCsv";

const OPTIONAL_FIELDS = ["email_password", "two_fa", "recovery_email", "recovery_email_password"];

// Repairs ONE credential set (a digital_stock_items row, or one entry of a
// digital_orders.credentials_snapshot array — same shape either way).
// Returns null if there's nothing to fix, otherwise the partial set of
// column changes to apply.
//
// Handles two cases, both using the exact detection lib/digitalAccountsCsv.js
// now applies at upload time (looksLikeCookieOrSessionData):
//   1. The classic bug reported: "email" itself is a cookie/csrftoken
//      string, with the REAL email having landed in a neighboring optional
//      column instead (email_password, recovery_email, or two_fa,
//      whichever position the old positional parser happened to shift it
//      into). Recovers the real email from whichever of those looks like
//      one, and vacates the field it was found in.
//   2. Any OTHER optional field (independent of case 1) that's cookie-like
//      on its own — same per-field siphon the parser does now.
// Every removed cookie/session string is preserved, not discarded — appended
// onto extra_data (joined with the field's own pre-existing extra_data, if
// any) so nothing about the original log data is lost.
function repairCredentialFields(row) {
  const changes = {};
  const extras = [];

  const email = row.email;
  if (email && looksLikeCookieOrSessionData(email)) {
    extras.push(email);
    let recovered = null;
    for (const key of ["email_password", "recovery_email", "two_fa"]) {
      const v = row[key];
      if (v && looksLikeEmail(v)) {
        recovered = v;
        changes[key] = null; // vacate the field the real email was mistakenly sitting in
        break;
      }
    }
    changes.email = recovered;
  }

  for (const key of OPTIONAL_FIELDS) {
    const current = key in changes ? changes[key] : row[key];
    if (current && looksLikeCookieOrSessionData(current)) {
      extras.push(current);
      changes[key] = null;
    }
  }

  if (extras.length === 0) return null;
  changes.extra_data = [row.extra_data, ...extras].filter(Boolean).join("; ");
  return changes;
}

// One-time (but safe to re-run — a row with nothing to fix is left
// untouched) repair for accounts uploaded BEFORE the cookie/session-data
// auto-detect existed in lib/digitalAccountsCsv.js. Re-scans every stock row
// regardless of status (a sold row's credentials were already handed to a
// customer, so this is still worth fixing) plus every order's stored
// credentials_snapshot, since that's what Order Details falls back to if the
// live stock row is ever gone.
export async function POST() {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: items, error: itemsError } = await admin
    .from("digital_stock_items")
    .select("id, email, email_password, two_fa, recovery_email, recovery_email_password, extra_data");
  if (itemsError) {
    return NextResponse.json({ error: "Could not load stock items." }, { status: 500 });
  }

  let stockFixed = 0;
  for (const row of items || []) {
    const changes = repairCredentialFields(row);
    if (!changes) continue;
    const { error } = await admin.from("digital_stock_items").update(changes).eq("id", row.id);
    if (!error) stockFixed++;
  }

  const { data: orders, error: ordersError } = await admin
    .from("digital_orders")
    .select("id, credentials_snapshot");
  if (ordersError) {
    return NextResponse.json({ error: "Could not load orders." }, { status: 500 });
  }

  let ordersFixed = 0;
  for (const order of orders || []) {
    const snapshot = Array.isArray(order.credentials_snapshot) ? order.credentials_snapshot : [];
    if (snapshot.length === 0) continue;

    let changed = false;
    const nextSnapshot = snapshot.map((item) => {
      const changes = repairCredentialFields(item);
      if (!changes) return item;
      changed = true;
      return { ...item, ...changes };
    });
    if (!changed) continue;

    const { error } = await admin
      .from("digital_orders")
      .update({ credentials_snapshot: nextSnapshot })
      .eq("id", order.id);
    if (!error) ordersFixed++;
  }

  return NextResponse.json({ stockFixed, ordersFixed });
}
