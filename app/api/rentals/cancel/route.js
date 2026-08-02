import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelRental, DaisyError } from "@/lib/daisy";
import { cancelActivation, DaisySimError } from "@/lib/daisysim";

export async function POST(request) {
  const { user, supabase } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { rentalId } = await request.json();
  const { data: rental } = await supabase.from("rentals").select("*").eq("id", rentalId).single();
  if (!rental) return NextResponse.json({ error: "Rental not found" }, { status: 404 });

  if (rental.status !== "waiting") {
    return NextResponse.json({ error: "Only rentals still waiting for a code can be cancelled" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (rental.provider === "daisysim") {
    try {
      await cancelActivation(rental.daisysim_activation_id);
    } catch (err) {
      if (err instanceof DaisySimError && err.code === "TOO_EARLY") {
        return NextResponse.json(
          { error: "This number was just purchased — wait a couple of minutes before cancelling." },
          { status: 400 }
        );
      }
      if (err instanceof DaisySimError && err.code === "CODE_RECEIVED") {
        // DaisySim rejects the cancel but includes the code in the response
        // body since one arrived right as we tried — surface it instead of
        // leaving the customer with neither a cancellation nor a code.
        const code = err.raw?.data?.code || err.raw?.code || null;
        const { data: updated } = await admin
          .from("rentals")
          .update({
            status: "received",
            sms_code: code,
            updated_at: new Date().toISOString(),
          })
          .eq("id", rentalId)
          .select()
          .single();
        return NextResponse.json({
          rental: updated,
          error: "A code arrived just as you cancelled — this number wasn't cancelled.",
        });
      }
      return NextResponse.json({ error: "Could not cancel right now" }, { status: 502 });
    }
  } else {
    try {
      await cancelRental(rental.daisy_id);
    } catch (err) {
      if (err instanceof DaisyError && err.code === "ACCESS_READY") {
        return NextResponse.json(
          { error: "This number already received a code and can't be cancelled." },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: "Could not cancel right now" }, { status: 502 });
    }
  }

  const { data: updated } = await admin
    .from("rentals")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", rentalId)
    .select()
    .single();

  await admin.rpc("adjust_balance", {
    p_user_id: user.id,
    p_amount: rental.price,
    p_type: "refund",
    p_reference_id: rental.id,
    p_note: `Refund for cancelled ${rental.service_name || rental.service_id} number ${rental.phone_number}`,
    p_created_by: null,
  });

  return NextResponse.json({ rental: updated });
}
