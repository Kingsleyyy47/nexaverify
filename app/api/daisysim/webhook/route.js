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
// This webhook is configured once per DaisySim ACCOUNT, not per product —
// DAISYSIM_API_KEY ("All countries") and DAISYSIM_USA_API_KEY ("US Only")
// are the same account/key, so an activation from either product can land
// here. Activation IDs are checked against both provider's ID columns below
// (daisysim_activation_id, then daisysim_usa_activation_id) so a "US Only"
// code arriving through this same shared webhook still gets matched — even
// though NexaVerify doesn't rely on it for that product (it's poll-only per
// the server7 docs), this is a free, faster path when it does fire.
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
    const { data } = await admin
      .from("rentals")
      .select("*")
      .eq("provider", "daisysim_usa")
      .eq("daisysim_usa_activation_id", String(activationId))
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
