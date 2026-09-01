import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Receives push notifications from Getatext (configured as a plain URL in
// your Getatext profile — see SUPABASE_SETUP.md section 17). Getatext's docs
// don't describe any request-signing scheme at all (their only advice is to
// IP-whitelist or otherwise secure the endpoint yourself), so — same as the
// DaisySim/DaisySMS webhooks — a shared secret is embedded directly in the
// URL you register with them as a query string
// (?secret=YOUR_GETATEXT_WEBHOOK_SECRET), since there's no dedicated
// "signing secret" field on their side to configure separately.
//
// Payload shape (per Getatext's docs):
//   { id, code, received_at, number, service_name, status, cost }
// There's no explicit "code.received" event type the way DaisySim's webhook
// has — a payload is only ever sent when a code arrives, so simply having a
// non-empty `code` is what's treated as the signal here (same logic
// lib/getatext.js#checkSms already uses for polling, so the two paths can
// never disagree about what counts as "received").
//
// Only ever matches "US Only" (provider='daisysim_usa') rentals — this
// product is backed by Getatext now, see lib/getatext.js. Polling (see
// app/api/rentals/status/route.js, checkSms) remains the PRIMARY path;
// this webhook is a faster, best-effort bonus on top of it, not a
// replacement — if it's misconfigured or never arrives, polling still
// catches the code within its normal 5s interval.
export async function POST(request) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (!process.env.GETATEXT_WEBHOOK_SECRET || secret !== process.env.GETATEXT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id: activationId, code } = payload || {};
  const hasCode = code != null && String(code).length > 0;
  if (!activationId || !hasCode) {
    // Ack anyway — nothing actionable, but no reason to make Getatext retry.
    return NextResponse.json({ ok: true, matched: false });
  }

  const admin = createAdminClient();

  const { data: rental } = await admin
    .from("rentals")
    .select("*")
    .eq("provider", "daisysim_usa")
    .eq("daisysim_usa_activation_id", String(activationId))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!rental) {
    return NextResponse.json({ ok: true, matched: false });
  }

  await admin.from("sms_messages").insert({
    rental_id: rental.id,
    code: String(code),
    text: String(code),
  });

  await admin
    .from("rentals")
    .update({
      status: rental.status === "waiting" ? "received" : rental.status,
      sms_code: rental.sms_code || String(code),
      updated_at: new Date().toISOString(),
    })
    .eq("id", rental.id);

  return NextResponse.json({ ok: true, matched: true });
}
