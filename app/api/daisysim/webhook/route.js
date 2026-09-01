import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Receives "code.received" push notifications from DaisySim (configured in
// their dashboard under Settings -> Webhook URL) — mirrors
// app/api/daisy/webhook for the DaisySMS side. DaisySim's docs don't
// describe any request-signing scheme, so this uses the same shared-secret
// query-string convention as the DaisySMS webhook (see
// DAISYSIM_WEBHOOK_SECRET in .env.example) to stop random internet traffic
// from posting fake events. Must respond 2xx within 10s per their docs.
//
// Only ever matches "All countries" (provider='daisysim') rentals —
// "US Only" (provider='daisysim_usa') used to share this same DaisySim
// account/webhook back when it was also backed by DaisySim's server7 API,
// but it's backed by Getatext now (see lib/getatext.js), a completely
// separate provider that would never post to this endpoint. "US Only" is
// polling-only (see app/api/rentals/status/route.js); if Getatext ever gets
// its own webhook wired up, it needs its own route, not this one.
export async function POST(request) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (!process.env.DAISYSIM_WEBHOOK_SECRET || secret !== process.env.DAISYSIM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event, activation_id: activationId, code } = payload || {};
  if (event !== "code.received" || !activationId) {
    // Ack anyway — nothing to do, but no reason to make DaisySim retry.
    return NextResponse.json({ ok: true, matched: false });
  }

  const admin = createAdminClient();

  let rental = null;

  {
    const { data } = await admin
      .from("rentals")
      .select("*")
      .eq("provider", "daisysim")
      .eq("daisysim_activation_id", String(activationId))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    rental = data;
  }

  if (!rental) {
    return NextResponse.json({ ok: true, matched: false });
  }

  await admin.from("sms_messages").insert({
    rental_id: rental.id,
    code: code ?? null,
    text: code ?? null,
  });

  await admin
    .from("rentals")
    .update({
      status: rental.status === "waiting" ? "received" : rental.status,
      sms_code: code ?? rental.sms_code,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rental.id);

  return NextResponse.json({ ok: true, matched: true });
}
