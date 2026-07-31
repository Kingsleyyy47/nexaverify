import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setAutoRenew, DaisyError } from "@/lib/daisy";

export async function POST(request) {
  const { user, supabase } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { rentalId, autoRenew } = await request.json();
  const { data: rental } = await supabase.from("rentals").select("*").eq("id", rentalId).single();
  if (!rental) return NextResponse.json({ error: "Rental not found" }, { status: 404 });

  try {
    await setAutoRenew(rental.daisy_id, Boolean(autoRenew));
  } catch (err) {
    if (err instanceof DaisyError && err.code === "BAD_ID") {
      return NextResponse.json({ error: "This isn't a long-term rental." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not update auto-renew right now" }, { status: 502 });
  }

  const admin = createAdminClient();
  const { data: updated } = await admin
    .from("rentals")
    .update({ auto_renew: Boolean(autoRenew), updated_at: new Date().toISOString() })
    .eq("id", rentalId)
    .select()
    .single();

  return NextResponse.json({ rental: updated });
}
