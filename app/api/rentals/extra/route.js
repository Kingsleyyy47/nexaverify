import { readObjectBody } from "@/lib/request-body.mjs";
import { adjustBalance } from "@/lib/wallet-adjustment.mjs";
import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExtraActivation, cancelRental, DaisyError } from "@/lib/daisy";
import { safeErrorResponse } from "@/lib/apiError";

// Requests an additional SMS code on a number the customer already rented
// (see "Additional rentals" in the DaisySMS docs). Mainly used for long-term
// numbers that need to receive more than one code over their lifetime.
export async function POST(request) {
  const { user, profile, profileError } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (profileError || !profile) return NextResponse.json({ error: "Could not load your account. Please try again." }, { status: 503 });
  const requestBody = await readObjectBody(request);
  if (!requestBody) return NextResponse.json({ error: "Send a valid JSON object." }, { status: 400 });
  const { rentalId, expectedPrice } = requestBody;
  const admin = createAdminClient();
  const { data: rental, error: lookupError } = await admin
    .from("rentals").select("*").eq("id", rentalId).eq("user_id", user.id).maybeSingle();
  if (lookupError) return safeErrorResponse(lookupError, { route: "/api/rentals/extra", userId: user.id });
  if (!rental) return NextResponse.json({ error: "Rental not found" }, { status: 404 });

  if (rental.provider && rental.provider !== "daisysms") return NextResponse.json({ error: "Additional codes are not supported by this provider." }, { status: 400 });
  if (!["received", "done"].includes(rental.status)) return NextResponse.json({ error: "Finish the current code before requesting another." }, { status: 409 });
  const { data: service, error: serviceError } = await admin.from("services").select("enabled, customer_price").eq("id", rental.service_id).maybeSingle();
  if (serviceError) return safeErrorResponse(serviceError, { route: "/api/rentals/extra", userId: user.id });
  const price = Number(service?.customer_price);
  if (!service?.enabled || !Number.isFinite(price) || price <= 0) return NextResponse.json({ error: "This product is not available or priced yet." }, { status: 403 });
  if (Number(expectedPrice) !== price) return NextResponse.json({ error: "Review the current product price before requesting another code.", price }, { status: 409 });
  if (Number(profile.balance) < price) return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 402 });

  let result;
  try {
    result = await getExtraActivation(rental.daisy_id);
  } catch (err) {
    if (err instanceof DaisyError && err.code === "BAD_ID") {
      return NextResponse.json(
        { error: "Can't request another code for this number right now." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Could not request another code right now" }, { status: 502 });
  }

  // A free long-term wake-up stays on its original rental. A provider-priced
  // repeat is a separate customer purchase at the admin's NGN product price.
  const paid = !rental.is_long_term || Number(result.price) > 0;
  const values = { daisy_id: result.daisyId, status: "waiting", sms_code: null,
    full_text: null, updated_at: new Date().toISOString() };
  const { data: updated, error: saveError } = paid
    ? await admin.from("rentals").insert({ ...values, user_id: user.id, service_id: rental.service_id,
        phone_number: result.phoneNumber, price, cost_usd: result.price, provider: rental.provider || "daisysms",
        is_long_term: false, auto_renew: false }).select().single()
    : await admin.from("rentals").update(values).eq("id", rental.id).eq("user_id", user.id)
        .in("status", ["received", "done"]).select().maybeSingle();
  if (saveError || !updated) {
    try { await cancelRental(result.daisyId); } catch { /* Provider may require a delay before cancellation. */ }
    return safeErrorResponse(saveError || new Error("Rental status changed"), { route: "/api/rentals/extra", userId: user.id });
  }
  if (paid) {
    try {
      await adjustBalance(admin, { p_user_id: user.id, p_amount: -price, p_type: "purchase",
        p_reference_id: updated.id, p_note: `Additional code for ${rental.service_id}`, p_created_by: null });
    } catch (err) {
      try { await cancelRental(result.daisyId); } catch { /* Keep the record for support reconciliation. */ }
      await admin.from("rentals").update({ status: "cancelled", cancel_error: "Extra activation wallet debit failed" }).eq("id", updated.id);
      return safeErrorResponse(err, { route: "/api/rentals/extra", userId: user.id, context: { rentalId: updated.id } });
    }
  }

  return NextResponse.json({
    rental: updated,
    readyAt: result.ready ? null : result.readyAt,
  });
}
