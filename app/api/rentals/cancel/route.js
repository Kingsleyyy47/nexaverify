import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelRental, DaisyError } from "@/lib/daisy";

export async function POST(request) {
  const { user, supabase } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { rentalId } = await request.json();
  const { data: rental } = await supabase.from("rentals").select("*").eq("id", rentalId).single();
  if (!rental) return NextResponse.json({ error: "Rental not found" }, { status: 404 });

  if (rental.status !== "waiting") {
    return NextResponse.json({ error: "Only rentals still waiting for a code can be cancelled" }, { status: 400 });
  }

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

  const admin = createAdminClient();

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
    p_note: `Refund for cancelled ${rental.service_id} number ${rental.phone_number}`,
    p_created_by: null,
  });

  return NextResponse.json({ rental: updated });
}
