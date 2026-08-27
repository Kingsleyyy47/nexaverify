import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { cancelRental, getStatus, DaisyError } from "@/lib/daisy";
import { cancelActivation, DaisySimError } from "@/lib/daisysim";
import { cancelActivation as cancelActivationUsa, DaisySimUsaError } from "@/lib/daisysimUsa";
import { RENTAL_TIMEOUT_MINUTES } from "@/lib/rentalTimeout";

// Kingsley's rule: any rental (any provider) that's gone
// RENTAL_TIMEOUT_MINUTES without a code gets cancelled on the provider,
// cancelled on our side, and fully refunded — automatically, server-side,
// whether or not the customer still has the page open. Called on a timer
// (see supabase/cron.sql, 'nexaverify-sweep-timeouts', every minute) via
// CRON_SECRET, same pattern as the other scheduled admin routes. Also
// callable by a logged-in admin. The exact minute count lives in
// lib/rentalTimeout.js — shared with the client-side countdown shown on
// NumberCard.js so the two can never disagree.
const TIMEOUT_MINUTES = RENTAL_TIMEOUT_MINUTES;

export async function POST(request) {
  if (!isAuthorizedCron(request)) {
    const { user, profile } = await getSessionProfile();
    if (!user || !isAdmin(profile)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000).toISOString();

  // Every provider's rentals live in the same table, branched below by
  // `provider` — no separate query needed per provider. `is_long_term`
  // rentals are explicitly excluded: those are SUPPOSED to sit "waiting" for
  // a code indefinitely (that's the entire point of a long-term rental), so
  // this rule only ever applies to normal short-term numbers.
  const [{ data: expired, error: fetchError }, { data: pendingRefunds, error: pendingError }] = await Promise.all([
    admin
      .from("rentals")
      .select("*")
      .eq("status", "waiting")
      .eq("is_long_term", false)
      .lt("created_at", cutoff),
    // Rare recovery path: a previous run cancelled these on the provider and
    // claimed status='cancelled' but adjust_balance itself then failed, so
    // refunded_at got reset back to null (see the catch block below). They
    // won't show up in the query above since status is no longer 'waiting' —
    // this catches them so the refund still eventually goes through without
    // trying to cancel on the provider a second time. Explicitly excludes
    // refund_denied_by_provider=true rentals — those have refunded_at null
    // for a DIFFERENT reason (the provider itself declined the refund, not a
    // transient adjust_balance failure) and must NOT be auto-credited here;
    // they need an admin to look at them.
    admin
      .from("rentals")
      .select("*")
      .eq("status", "cancelled")
      .is("refunded_at", null)
      .eq("refund_denied_by_provider", false),
  ]);

  if (fetchError || pendingError) {
    return NextResponse.json({ error: "Could not load expired rentals" }, { status: 500 });
  }

  const results = {
    checked: expired?.length || 0,
    cancelled: 0,
    refunded: 0,
    receivedInstead: 0,
    errors: 0,
    refundRetries: pendingRefunds?.length || 0,
  };

  for (const rental of expired || []) {
    await processExpiredRental(admin, rental, results);
  }

  for (const rental of pendingRefunds || []) {
    await retryPendingRefund(admin, rental, results);
  }

  return NextResponse.json(results);
}

// Refund-only retry for a rental that's already cancelled on the provider
// (from an earlier run) but never got successfully credited back — see the
// `pendingRefunds` query above.
async function retryPendingRefund(admin, rental, results) {
  const { data: claimed } = await admin
    .from("rentals")
    .update({ refunded_at: new Date().toISOString(), cancel_error: null })
    .eq("id", rental.id)
    .eq("status", "cancelled")
    .is("refunded_at", null)
    .eq("refund_denied_by_provider", false)
    .select()
    .maybeSingle();

  if (!claimed) return;

  try {
    await admin.rpc("adjust_balance", {
      p_user_id: claimed.user_id,
      p_amount: claimed.price,
      p_type: "refund",
      p_reference_id: claimed.id,
      p_note: `Refund for timed-out ${claimed.service_name || claimed.service_id || "number"} ${
        claimed.phone_number
      } (no code within ${TIMEOUT_MINUTES} minutes)`,
      p_created_by: null,
    });
    results.refunded++;
  } catch (err) {
    console.error(`[sweep-timeouts] refund retry failed for rental ${claimed.id}:`, err.message);
    await admin
      .from("rentals")
      .update({ refunded_at: null, cancel_error: `refund failed: ${err.message}`.slice(0, 500) })
      .eq("id", claimed.id);
    results.errors++;
  }
}

async function processExpiredRental(admin, rental, results) {
  const isDaisySim = rental.provider === "daisysim";
  const isDaisySimUsa = rental.provider === "daisysim_usa";
  const now = new Date().toISOString();

  // Set below for daisysim/daisysim_usa only — see the matching comment in
  // app/api/rentals/cancel/route.js. Their /cancel response includes an
  // explicit `refund` boolean confirming the provider's own side actually
  // credited our master balance back; DaisySMS's cancelRental has no
  // equivalent field, so its ACCESS_CANCEL response IS full confirmation
  // for that provider. `alreadyGone` below (provider has no record of the
  // rental at all) has no response to check either — treated as confirmed
  // since there's genuinely nothing more to verify against.
  let providerRefundConfirmed = true;

  try {
    if (isDaisySim) {
      const result = await cancelActivation(rental.daisysim_activation_id);
      providerRefundConfirmed = Boolean(result.refund);
    } else if (isDaisySimUsa) {
      const result = await cancelActivationUsa(rental.daisysim_usa_activation_id);
      providerRefundConfirmed = Boolean(result.refund);
    } else {
      await cancelRental(rental.daisy_id);
    }
  } catch (err) {
    // A code arrived at the exact moment we tried to cancel — all three
    // providers reject the cancel in this case. Surface the code instead of
    // leaving the customer with neither a working number nor a refund.
    // Guarded by `.eq("status", "waiting")` so this can't clobber a rental
    // someone else (e.g. a concurrent manual cancel) already moved on from.
    if (
      ((isDaisySim && err instanceof DaisySimError) || (isDaisySimUsa && err instanceof DaisySimUsaError)) &&
      err.code === "CODE_RECEIVED"
    ) {
      const code = err.raw?.data?.code || err.raw?.code || null;
      await admin
        .from("rentals")
        .update({ status: "received", sms_code: code, updated_at: now })
        .eq("id", rental.id)
        .eq("status", "waiting");
      results.receivedInstead++;
      return;
    }
    if (!isDaisySim && !isDaisySimUsa && err instanceof DaisyError && err.code === "ACCESS_READY") {
      // DaisySMS's cancel-rejection doesn't include the code in the response
      // body (unlike DaisySim's) — fetch it separately so it's not lost.
      let code = null;
      try {
        const status = await getStatus(rental.daisy_id, { wantFullText: true });
        if (status.status === "received") code = status.code;
      } catch {
        // best effort — worst case the customer sees "received" with no
        // code yet and the next status poll picks it up
      }
      await admin
        .from("rentals")
        .update({ status: "received", sms_code: code, updated_at: now })
        .eq("id", rental.id)
        .eq("status", "waiting");
      results.receivedInstead++;
      return;
    }

    // "Nothing left to cancel" — the provider already considers this rental
    // gone (expired on their end, or previously cancelled some other way).
    // Treat exactly like a successful cancel rather than an error.
    const alreadyGone =
      (isDaisySim && err instanceof DaisySimError && err.code === "NOT_FOUND") ||
      (isDaisySimUsa && err instanceof DaisySimUsaError && err.code === "NOT_FOUND") ||
      (!isDaisySim && !isDaisySimUsa && err instanceof DaisyError && err.code === "NO_ACTIVATION");

    if (!alreadyGone) {
      // Real failure (network hiccup, timeout, unexpected provider
      // response) — do NOT touch status. Leaving it at 'waiting' means this
      // exact rental is still past the cutoff on the NEXT sweep run, so it
      // retries automatically with no extra bookkeeping needed. Just record
      // the error for admin visibility.
      console.error(
        `[sweep-timeouts] provider cancel failed for rental ${rental.id} (${rental.provider}):`,
        err.code || err.message
      );
      await admin
        .from("rentals")
        .update({ cancel_error: String(err.code || err.message || "unknown error").slice(0, 500) })
        .eq("id", rental.id);
      results.errors++;
      return;
    }
  }

  if (!providerRefundConfirmed) {
    // Provider cancelled the number but did NOT confirm a refund on their
    // end — mark it cancelled (so the customer isn't left thinking a dead
    // number is still active) but deliberately withhold the wallet credit
    // and refunded_at, same as the manual cancel route. Flagged for admin
    // review rather than assuming the customer should be made whole out of
    // NexaVerify's own pocket for a refund the provider didn't grant.
    await admin
      .from("rentals")
      .update({
        status: "cancelled",
        refund_denied_by_provider: true,
        cancel_error: "Provider cancelled but did not confirm a refund — needs admin review before crediting.",
        updated_at: now,
      })
      .eq("id", rental.id)
      .eq("status", "waiting");
    results.cancelled++;
    results.errors++;
    return;
  }

  // Provider cancel succeeded (or there was nothing left to cancel) — claim
  // the cancellation AND the refund together in one atomic UPDATE. Both
  // conditions (still 'waiting', not already refunded) must hold, so this
  // can never double-process a rental a concurrent manual cancel (see
  // app/api/rentals/cancel) already claimed a moment earlier.
  const { data: claimed } = await admin
    .from("rentals")
    .update({
      status: "cancelled",
      cancel_error: null,
      refunded_at: now,
      updated_at: now,
    })
    .eq("id", rental.id)
    .eq("status", "waiting")
    .is("refunded_at", null)
    .select()
    .maybeSingle();

  if (!claimed) {
    // Lost the race to a manual cancel — already handled, nothing more to do.
    return;
  }

  results.cancelled++;

  try {
    await admin.rpc("adjust_balance", {
      p_user_id: claimed.user_id,
      p_amount: claimed.price,
      p_type: "refund",
      p_reference_id: claimed.id,
      p_note: `Refund for timed-out ${claimed.service_name || claimed.service_id || "number"} ${
        claimed.phone_number
      } (no code within ${TIMEOUT_MINUTES} minutes)`,
      p_created_by: null,
    });
    results.refunded++;
  } catch (err) {
    // adjust_balance itself failed (rare — e.g. a transient DB issue). The
    // provider is already cancelled at this point, so un-claim JUST the
    // refund (not status) — the next sweep run will retry the credit
    // without trying to cancel on the provider again.
    console.error(`[sweep-timeouts] refund failed for rental ${claimed.id}:`, err.message);
    await admin
      .from("rentals")
      .update({ refunded_at: null, cancel_error: `refund failed: ${err.message}`.slice(0, 500) })
      .eq("id", claimed.id);
    results.errors++;
  }
}
