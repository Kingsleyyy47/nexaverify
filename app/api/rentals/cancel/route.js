import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelRental, DaisyError } from "@/lib/daisy";
import { cancelActivation, DaisySimError } from "@/lib/daisysim";
import { cancelActivation as cancelActivationUsa, DaisySimUsaError } from "@/lib/daisysimUsa";

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
  } else if (rental.provider === "daisysim_usa") {
    try {
      await cancelActivationUsa(rental.daisysim_usa_activation_id);
    } catch (err) {
      if (err instanceof DaisySimUsaError && err.code === "TOO_EARLY") {
        return NextResponse.json(
          { error: "This number was just purchased — wait a couple of minutes before cancelling." },
          { status: 400 }
        );
      }
      if (err instanceof DaisySimUsaError && err.code === "CODE_RECEIVED") {
        // Rejects the cancel but includes the code in the response body
        // since one arrived right as we tried — surface it instead of
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

  // Claims the cancellation AND the refund together in one atomic UPDATE —
  // both conditions (status still 'waiting', refunded_at still null) have to
  // hold, so this can never fire twice for the same rental even if the
  // 3-minute timeout sweep (see app/api/admin/rentals/sweep-timeouts) is
  // racing this exact same rental at the same moment. Whichever request wins
  // the UPDATE is the only one that refunds; the loser sees 0 rows back and
  // does nothing further.
  const { data: updated } = await admin
    .from("rentals")
    .update({
      status: "cancelled",
      refunded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", rentalId)
    .eq("status", "waiting")
    .is("refunded_at", null)
    .select()
    .maybeSingle();

  if (!updated) {
    // Lost the race (e.g. the timeout sweep already cancelled + refunded
    // this exact rental in between) — it's still cancelled, just not by us.
    const { data: current } = await admin.from("rentals").select("*").eq("id", rentalId).single();
    return NextResponse.json({ rental: current });
  }

  try {
    await admin.rpc("adjust_balance", {
      p_user_id: user.id,
      p_amount: rental.price,
      p_type: "refund",
      p_reference_id: rental.id,
      p_note: `Refund for cancelled ${rental.service_name || rental.service_id} number ${rental.phone_number}`,
      p_created_by: null,
    });
  } catch (err) {
    // The provider cancel already went through above, so we can't (and
    // shouldn't) revert `status`. But `updated` (the rental object returned
    // to the client) came from the SELECT before this failed, so if we left
    // refunded_at as-is, the credit would be lost forever — the sweep route's
    // `pendingRefunds` recovery query only picks up rentals where
    // refunded_at IS NULL. Un-claim just the refund, same pattern as
    // app/api/admin/rentals/sweep-timeouts, so that route's next run (every
    // minute) retries the credit automatically without re-cancelling on the
    // provider a second time.
    console.error(`[rentals/cancel] refund failed for rental ${updated.id}:`, err.message);
    await admin
      .from("rentals")
      .update({ refunded_at: null, cancel_error: `refund failed: ${err.message}`.slice(0, 500) })
      .eq("id", updated.id);
    return NextResponse.json({
      rental: { ...updated, refunded_at: null },
      error: "Cancelled, but the refund is still processing — it'll land automatically within a minute.",
    });
  }

  return NextResponse.json({ rental: updated });
}
