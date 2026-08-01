import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { initializePayment, PocketfiError } from "@/lib/pocketfi";

// Starts an instant wallet funding session via PocketFi. Creates a hosted
// checkout link the browser should redirect to next. See
// supabase/schema.sql's payment_transactions comment for the full flow.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { amount } = await request.json();
  const parsedAmount = Number(amount);

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
  }
  if (!user.email) {
    return NextResponse.json({ error: "Your account has no email on file" }, { status: 400 });
  }

  // PocketFi's checkout requires a first/last name and phone, but NexaVerify
  // doesn't collect any of those from customers (only username + email) —
  // per Kingsley's call to drop those fields from the funding form, these
  // are just placeholders so the API accepts the request. PocketFi never
  // uses them to contact the customer directly (the customer completes
  // payment on PocketFi's own hosted page), so this is safe.
  const firstName = profile?.username || "NexaVerify";
  const lastName = "Customer";
  const phone = "08000000000";

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, "");

  // Generated BEFORE calling PocketFi, since redirect_link has to be decided
  // in the same request that returns their payment_id — we can't embed
  // PocketFi's own id into a URL we're submitting before we have it. This ref
  // is what the callback route actually looks the row up by. See the
  // client_ref column comment in supabase/schema.sql.
  const clientRef = randomUUID();

  let initialized;
  try {
    initialized = await initializePayment({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      email: user.email,
      amount: parsedAmount,
      redirectLink: `${siteUrl}/api/wallet/fund/callback?ref=${clientRef}`,
    });
  } catch (err) {
    if (err instanceof PocketfiError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }

  const admin = createAdminClient();
  const { error: insertError } = await admin.from("payment_transactions").insert({
    user_id: user.id,
    provider: "pocketfi",
    payment_id: initialized.paymentId,
    client_ref: clientRef,
    amount_ngn: parsedAmount,
  });

  if (insertError) {
    return NextResponse.json({ error: "Could not start funding session" }, { status: 500 });
  }

  return NextResponse.json({
    paymentLink: initialized.paymentLink,
  });
}
