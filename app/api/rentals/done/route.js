import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { markDone, DaisyError } from "@/lib/daisy";

export async function POST(request) {
  const { user, supabase } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { rentalId } = await request.json();
  const { data: rental } = await supabase.from("rentals").select("*").eq("id", rentalId).single();
  if (!rental) return NextResponse.json({ error: "Rental not found" }, { status: 404 });

  // DaisySim has no "mark done" equivalent (no setStatus-style endpoint) —
  // once a code arrives there's nothing further to tell the provider, so
  // this is purely a local status change for daisysim rentals.
  if (rental.provider !== "daisysim") {
    try {
      await markDone(rental.daisy_id);
    } catch (err) {
      if (!(err instanceof DaisyError && err.code === "NO_ACTIVATION")) {
        return NextResponse.json({ error: "Could not mark as done right now" }, { status: 502 });
      }
      // NO_ACTIVATION here just means DaisySMS already considers it finished — proceed.
    }
  }

  const admin = createAdminClient();
  const { data: updated } = await admin
    .from("rentals")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", rentalId)
    .select()
    .single();

  return NextResponse.json({ rental: updated });
}
