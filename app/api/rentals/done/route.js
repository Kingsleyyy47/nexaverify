import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { markDone, DaisyError } from "@/lib/daisy";
import { safeErrorResponse } from "@/lib/apiError";

export async function POST(request) {
  const { user } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { rentalId } = await request.json();
  const admin = createAdminClient();
  const { data: rental, error: lookupError } = await admin
    .from("rentals").select("*").eq("id", rentalId).eq("user_id", user.id).maybeSingle();
  if (lookupError) return safeErrorResponse(lookupError, { route: "/api/rentals/done", userId: user.id });
  if (!rental) return NextResponse.json({ error: "Rental not found" }, { status: 404 });

  // DaisySim (both "All countries" and "US Only") has no "mark done"
  // equivalent (no setStatus-style endpoint) — once a code arrives there's
  // nothing further to tell the provider, so this is purely a local status
  // change for those rentals.
  if (rental.provider !== "daisysim" && rental.provider !== "daisysim_usa") {
    try {
      await markDone(rental.daisy_id);
    } catch (err) {
      if (!(err instanceof DaisyError && err.code === "NO_ACTIVATION")) {
        return NextResponse.json({ error: "Could not mark as done right now" }, { status: 502 });
      }
      // NO_ACTIVATION here just means DaisySMS already considers it finished — proceed.
    }
  }

  const { data: updated } = await admin
    .from("rentals")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", rentalId)
    .select()
    .single();

  return NextResponse.json({ rental: updated });
}
