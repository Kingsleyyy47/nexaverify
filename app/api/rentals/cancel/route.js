import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelRental, DaisyError } from "@/lib/daisy";
import { cancelActivation, DaisySimError } from "@/lib/daisysim";
import { cancelActivation as cancelActivationUsa, checkSms as checkSmsUsa } from "@/lib/getatext";
import { cancelActivation as cancelActivationServer7, checkStatus as checkStatusServer7, DaisySimUsaError } from "@/lib/daisysimUsa";
import { logError } from "@/lib/errorLog";

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

  // Set below for daisysim only — its /cancel response includes an explicit
  // `refund` boolean confirming THEIR side actually credited our master
  // balance back, separate from the cancel itself succeeding. Neither
  // DaisySMS's cancelRental nor Getatext's cancel-rental (backing
  // "daisysim_usa" now — see lib/getatext.js) has an equivalent field; a
  // single successful response IS full confirmation for both of those. We
  // must not credit the customer's wallet unless the upstream provider has
  // actually confirmed a refund, otherwise NexaVerify eats the cost of every
  // cancel the provider quietly declines to refund.
  let providerRefundConfirmed = true;

  if (rental.provider === "daisysim") {
    try {
      const result = await cancelActivation(rental.daisysim_activation_id);
      providerRefundConfirmed = Boolean(result.refund);
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
  } else if (rental.provider === "daisysim_usa" && rental.us_only_backend === "daisysim") {
    // "US Only" via DaisySim's dedicated server7 API — see lib/daisysimUsa.js.
    // Which backend fulfilled THIS rental is read off the row, not off
    // daisysim_usa_config's current value, so an admin toggle flip mid-flight
    // can never send a cancel to the wrong provider.
    try {
      const result = await cancelActivationServer7(rental.daisysim_server7_activation_id);
      providerRefundConfirmed = Boolean(result.refund);
    } catch (err) {
      // The docs describe CODE_RECEIVED/TOO_EARLY as distinct 422 responses
      // with a machine-readable `code` field, but a real cancel-during-
      // arrival (Sept 2026) came back without one, falling through to a raw
      // "DaisySim USA returned HTTP 422" — which then leaked straight to the
      // customer instead of a friendly message. Rather than keep guessing at
      // the exact response shape, re-check the rental's REAL status directly
      // whenever the cancel fails — if a code actually arrived, that's
      // authoritative regardless of what the cancel error looked like.
      let statusAfterFailedCancel = null;
      try {
        statusAfterFailedCancel = await checkStatusServer7(rental.daisysim_server7_activation_id);
      } catch {
        // best effort — falls through to the generic handling below
      }

      if (statusAfterFailedCancel?.status === "received") {
        const { data: updated } = await admin
          .from("rentals")
          .update({
            status: "received",
            sms_code: statusAfterFailedCancel.code,
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

      if (err instanceof DaisySimUsaError && err.code === "TOO_EARLY") {
        return NextResponse.json(
          { error: "This number was just purchased — wait a bit before cancelling." },
          { status: 400 }
        );
      }

      // Anything else: never show the raw provider message to a customer
      // (it's meant for logs, not a UI) — log it with a reference ID so an
      // admin can see exactly what DaisySim sent back, same pattern as the
      // timeout sweep.
      const referenceId = await logError({
        error: err,
        route: "/api/rentals/cancel",
        userId: user.id,
        context: { rentalId, provider: "daisysim_usa", backend: "daisysim" },
      });
      return NextResponse.json({ error: `Could not cancel right now (ref ${referenceId})` }, { status: 502 });
    }
  } else if (rental.provider === "daisysim_usa") {
    // Legacy/default "US Only" backend — Getatext (lib/getatext.js).
    // Getatext's cancel-rental has no `refund` boolean and no documented
    // distinct error for "too early" or "code already arrived" the way
    // DaisySim's did (see lib/getatext.js's header comment) — a successful
    // call is treated as full refund confirmation on its own, and any
    // failure just falls through to the generic message below.
    try {
      const result = await cancelActivationUsa(rental.daisysim_usa_activation_id);
      providerRefundConfirmed = Boolean(result.refund);
    } catch (err) {
      // Getatext's `message` was assumed customer-safe (no provider
      // name/jargon), but that assumption is exactly what leaked raw
      // provider text to customers elsewhere on this same "US Only" product
      // (see the server7 branch above) — never trust it. Re-check the
      // rental's real status first: if a code actually arrived right as the
      // cancel was attempted, that's authoritative regardless of what the
      // cancel error said.
      let statusAfterFailedCancel = null;
      try {
        statusAfterFailedCancel = await checkSmsUsa(rental.daisysim_usa_activation_id);
      } catch {
        // best effort — falls through to the generic handling below
      }

      if (statusAfterFailedCancel?.status === "received") {
        const { data: updated } = await admin
          .from("rentals")
          .update({
            status: "received",
            sms_code: statusAfterFailedCancel.code,
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

      const referenceId = await logError({
        error: err,
        route: "/api/rentals/cancel",
        userId: user.id,
        context: { rentalId, provider: "daisysim_usa", backend: "getatext" },
      });
      return NextResponse.json({ error: `Could not cancel right now (ref ${referenceId})` }, { status: 502 });
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

  if (!providerRefundConfirmed) {
    // The provider cancelled the number but did NOT confirm a refund on
    // their end (daisysim/daisysim_usa's `refund` field came back false) —
    // mark it cancelled so the customer isn't stuck on a dead number, but
    // deliberately do NOT credit the wallet or set refunded_at. Flagged via
    // cancel_error for admin review; crediting here would mean NexaVerify
    // eats the cost every time the provider quietly declines to refund.
    const { data: cancelledNoRefund } = await admin
      .from("rentals")
      .update({
        status: "cancelled",
        refund_denied_by_provider: true,
        cancel_error: "Provider cancelled but did not confirm a refund — needs admin review before crediting.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", rentalId)
      .eq("status", "waiting")
      .select()
      .maybeSingle();
    return NextResponse.json({
      rental: cancelledNoRefund || rental,
      error: "Cancelled, but the provider didn't confirm a refund — support has been notified to review this.",
    });
  }

  // Claims the cancellation AND the refund together in one atomic UPDATE —
  // both conditions (status still 'waiting', refunded_at still null) have to
  // hold, so this can never fire twice for the same rental even if the
  // 15-minute backend timeout sweep (see app/api/admin/rentals/sweep-timeouts) is
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
