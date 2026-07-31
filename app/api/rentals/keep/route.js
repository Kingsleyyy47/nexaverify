import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { keepRental, DaisyError } from "@/lib/daisy";
import { syncLtrsIntoDb } from "@/lib/ltr-sync";

// "Keep" pretends a message was received on a long-term number so the LTR
// activates, for when real supply is tight and a genuine SMS won't arrive
// in time. DaisySMS bills this as if a real message came in.
export async function POST(request) {
  const { user, supabase } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { rentalId } = await request.json();
  const { data: rental } = await supabase.from("rentals").select("*").eq("id", rentalId).single();
  if (!rental) return NextResponse.json({ error: "Rental not found" }, { status: 404 });

  try {
    await keepRental(rental.daisy_id);
  } catch (err) {
    if (err instanceof DaisyError && err.code === "BAD_ID") {
      return NextResponse.json({ error: "This number isn't eligible for 'keep' right now." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not keep this number right now" }, { status: 502 });
  }

  const admin = createAdminClient();

  // Pull the fresh paid_until/status that "keep" just created.
  try {
    await syncLtrsIntoDb(admin);
  } catch {
    // non-fatal — the keep call itself already succeeded
  }

  const { data: updated } = await admin.from("rentals").select("*").eq("id", rentalId).single();
  return NextResponse.json({ rental: updated });
}
