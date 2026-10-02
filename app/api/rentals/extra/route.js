import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExtraActivation, DaisyError } from "@/lib/daisy";
import { safeErrorResponse } from "@/lib/apiError";

// Requests an additional SMS code on a number the customer already rented
// (see "Additional rentals" in the DaisySMS docs). Mainly used for long-term
// numbers that need to receive more than one code over their lifetime.
export async function POST(request) {
  const { user } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { rentalId } = await request.json();
  const admin = createAdminClient();
  const { data: rental, error: lookupError } = await admin
    .from("rentals").select("*").eq("id", rentalId).eq("user_id", user.id).maybeSingle();
  if (lookupError) return safeErrorResponse(lookupError, { route: "/api/rentals/extra", userId: user.id });
  if (!rental) return NextResponse.json({ error: "Rental not found" }, { status: 404 });

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

  const { data: updated } = await admin
    .from("rentals")
    .update({
      daisy_id: result.daisyId,
      status: "waiting",
      sms_code: null,
      full_text: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rental.id)
    .select()
    .single();

  // If DaisySMS charged a price for this extra activation, deduct it now.
  if (result.ready && result.price) {
    await admin.rpc("adjust_balance", {
      p_user_id: user.id,
      p_amount: -result.price,
      p_type: "purchase",
      p_reference_id: rental.id,
      p_note: `Additional code for ${rental.service_id} number ${rental.phone_number}`,
      p_created_by: null,
    });
  }

  return NextResponse.json({
    rental: updated,
    readyAt: result.ready ? null : result.readyAt,
  });
}
