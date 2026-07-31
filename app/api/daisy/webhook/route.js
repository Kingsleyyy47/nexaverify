import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Receives incoming SMS push notifications from DaisySMS (configured on
// https://daisysms.io/dashboard/profile). Must respond 2xx quickly or Daisy
// will retry up to 8 times, 15s apart.
//
// Protect this endpoint with a shared-secret query string param, since it
// has no other auth (see DAISYSMS_WEBHOOK_SECRET in .env.example and
// SUPABASE_SETUP.md step 7).
export async function POST(request) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (!process.env.DAISYSMS_WEBHOOK_SECRET || secret !== process.env.DAISYSMS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { activationId, messageId, text, code, receivedAt } = payload || {};
  if (!activationId) return NextResponse.json({ error: "Missing activationId" }, { status: 400 });

  const admin = createAdminClient();

  const { data: rental } = await admin
    .from("rentals")
    .select("*")
    .eq("daisy_id", String(activationId))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!rental) {
    // Unknown activation id — nothing to do, but still ack with 2xx so
    // DaisySMS doesn't keep retrying.
    return NextResponse.json({ ok: true, matched: false });
  }

  await admin.from("sms_messages").insert({
    rental_id: rental.id,
    daisy_message_id: messageId ?? null,
    code: code ?? null,
    text: text ?? null,
    received_at: receivedAt ? new Date(receivedAt) : new Date(),
  });

  await admin
    .from("rentals")
    .update({
      status: rental.status === "waiting" ? "received" : rental.status,
      sms_code: code ?? rental.sms_code,
      full_text: text ?? rental.full_text,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rental.id);

  return NextResponse.json({ ok: true, matched: true });
}
