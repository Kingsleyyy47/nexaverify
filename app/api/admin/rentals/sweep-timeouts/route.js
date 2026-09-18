import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { cancelRental, getStatus, DaisyError } from "@/lib/daisy";
import { cancelActivation, DaisySimError } from "@/lib/daisysim";
import { cancelActivation as cancelActivationUsa, GetatextError } from "@/lib/getatext";
import { cancelActivation as cancelActivationServer7, checkStatus as checkStatusServer7, DaisySimUsaError } from "@/lib/daisysimUsa";
import { RENTAL_BACKEND_TIMEOUT_MINUTES } from "@/lib/rentalTimeout";
import { logError } from "@/lib/errorLog";

// Kingsley's rule: any rental (any provider) that's gone
// RENTAL_BACKEND_TIMEOUT_MINUTES without a code gets cancelled on the
// provider, cancelled on our side, and fully refunded — automatically,
// server-side, whether or not the customer still has the page open. Called
// on a timer (see supabase/cron.sql, 'nexaverify-sweep-timeouts', every
// minute) via CRON_SECRET, same pattern as the other scheduled admin routes.
// Also callable by a logged-in admin. This is deliberately a LONGER window
// than the countdown shown to the customer on NumberCard.js
// (RENTAL_TIMEOUT_MINUTES, in lib/rentalTimeout.js) — see that file's
// comment for why the two are allowed to differ.
const TIMEOUT_MINUTES = RENTAL_BACKEND_TIMEOUT_MINUTES;

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
    const referenceId = await logError({
      error: err,
      route: "/api/admin/rentals/sweep-timeouts",
      userId: claimed.user_id,
      context: { rentalId: claimed.id, stage: "refund-retry" },
    });
    await admin
      .from("rentals")
      .update({ refunded_at: null, cancel_error: `refund failed: ${err.message} (ref ${referenceId})`.slice(0, 500) })
      .eq("id", claimed.id);
    results.errors++;
  }
}

async function processExpiredRental(admin, rental, results) {
  const isDaisySim = rental.provider === "daisysim";
  const isDaisySimUsa = rental.provider === "daisysim_usa";
  // "US Only" has two interchangeable backends — which one actually
  // fulfilled THIS rental is stamped on the row (us_only_backend),
  // independent of daisysim_usa_config's current value. Legacy rows from
  // before this column existed have us_only_backend === null and were
  // always Getatext-backed.
  const isServer7UsOnly = isDaisySimUsa && rental.us_only_backend === "daisysim";
  const isGetatextUsOnly = isDaisySimUsa && !isServer7UsOnly;
  const now = new Date().toISOString();

  // Set below for daisysim only — see the matching comment in
  // app/api/rentals/cancel/route.js. Its /cancel response includes an
  // explicit `refund` boolean confirming the provider's own side actually
  // credited our master balance back. Neither DaisySMS's cancelRental nor
  // Getatext's cancel-rental (backing "daisysim_usa" now — see
  // lib/getatext.js) has an equivalent field, so a single successful
  // response IS full confirmation for both of those. `alreadyGone` below
  // (provider has no record of the rental at all) has no response to check
  // either — treated as confirmed since there's genuinely nothing more to
  // verify against.
  let providerRefundConfirmed = true;
  // Set only when we deliberately cancel + refund WITHOUT a confirmed
  // provider-side cancellation — see the DaisySMS connectivity-failure
  // carve-out below. Carried through to the final "claimed" update's
  // cancel_error so this is never silently indistinguishable from a normal,
  // fully-confirmed cancel.
  let unconfirmedCancelNote = null;

  try {
    if (isDaisySim) {
      const result = await cancelActivation(rental.daisysim_activation_id);
      providerRefundConfirmed = Boolean(result.refund);
    } else if (isServer7UsOnly) {
      const result = await cancelActivationServer7(rental.daisysim_server7_activation_id);
      providerRefundConfirmed = Boolean(result.refund);
    } else if (isGetatextUsOnly) {
      const result = await cancelActivationUsa(rental.daisysim_usa_activation_id);
      providerRefundConfirmed = Boolean(result.refund);
    } else {
      await cancelRental(rental.daisy_id);
    }
  } catch (err) {
    // A code arrived at the exact moment we tried to cancel — DaisySim and
    // DaisySMS both reject the cancel in this case and hand back (or let us
    // separately fetch) the code, so it's surfaced instead of leaving the
    // customer with neither a working number nor a refund. Getatext doesn't
    // document an equivalent distinct error for this — a real "code arrived
    // right as we cancelled" race there just falls through to the generic
    // failure branch below and retries on the next sweep run, by which point
    // the customer's own status poll will typically have already caught the
    // code anyway. Guarded by `.eq("status", "waiting")` so this can't
    // clobber a rental someone else (e.g. a concurrent manual cancel)
    // already moved on from.
    if (isDaisySim && err instanceof DaisySimError && err.code === "CODE_RECEIVED") {
      const code = err.raw?.data?.code || err.raw?.code || null;
      await admin
        .from("rentals")
        .update({ status: "received", sms_code: code, updated_at: now })
        .eq("id", rental.id)
        .eq("status", "waiting");
      results.receivedInstead++;
      return;
    }
    // Same CODE_RECEIVED race documented for the server7 API's own /cancel —
    // "treat that as a successful check, not as a failure": a code arrived
    // right as we tried to cancel, so it's surfaced instead of leaving the
    // customer with neither a working number nor a refund. A real incident
    // (Sept 2026) showed this race coming back WITHOUT the documented
    // `code: "CODE_RECEIVED"` field — just a raw HTTP 422 — so rather than
    // trust that shape, re-check the rental's actual status directly. If a
    // code is really there, that's authoritative regardless of what the
    // cancel error looked like.
    if (isServer7UsOnly) {
      let statusAfterFailedCancel = null;
      try {
        statusAfterFailedCancel = await checkStatusServer7(rental.daisysim_server7_activation_id);
      } catch {
        // best effort — falls through to the generic handling below
      }
      if (statusAfterFailedCancel?.status === "received") {
        await admin
          .from("rentals")
          .update({ status: "received", sms_code: statusAfterFailedCancel.code, updated_at: now })
          .eq("id", rental.id)
          .eq("status", "waiting");
        results.receivedInstead++;
        return;
      }
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
      (isGetatextUsOnly && err instanceof GetatextError && err.code === "NOT_FOUND") ||
      (isServer7UsOnly && err instanceof DaisySimUsaError && ["NOT_FOUND", "USER_NOT_FOUND"].includes(err.code)) ||
      (!isDaisySim && !isDaisySimUsa && err instanceof DaisyError && err.code === "NO_ACTIVATION");

    // Sept 2026: DaisySMS's own Cloudflare started returning a bot-check
    // challenge page instead of a real API response, which means EVERY
    // cancelRental call fails — a stuck rental would retry forever every
    // minute and never clear for as long as DaisySMS's Cloudflare keeps
    // blocking us, since there's no way to "solve" a JS challenge from a
    // server-to-server request. Per Kingsley's explicit instruction ("cancel
    // from our side, leave Daisy"): for DaisySMS specifically, a failure to
    // even REACH the provider (as opposed to the provider clearly telling us
    // something, like ACCESS_READY/NO_ACTIVATION above) is treated as a
    // local-only cancel + refund — the customer isn't left stuck indefinitely
    // for a provider-side outage outside anyone's control. This intentionally
    // does NOT extend to DaisySim/Getatext, and NOT to a DaisySMS BAD_KEY
    // (a real credential problem, not a transient connectivity issue) —
    // those still fall through to the "leave stuck, retry" branch below.
    const isDaisyConnectivityFailure =
      !isDaisySim &&
      !isDaisySimUsa &&
      err instanceof DaisyError &&
      ["BAD_RESPONSE", "TIMEOUT", "NETWORK_ERROR"].includes(err.code);

    if (!alreadyGone && !isDaisyConnectivityFailure) {
      // Real failure (unexpected provider response, or a DaisySim/Getatext
      // connectivity issue — not carved out above) — do NOT touch status.
      // Leaving it at 'waiting' means this exact rental is still past the
      // cutoff on the NEXT sweep run, so it retries automatically with no
      // extra bookkeeping needed. Logged via logError (not just
      // console.error) so a systemic failure — e.g. every rental erroring at
      // once, as happened Sept 2026 — is actually visible in Admin >
      // Notifications with the real raw provider response, instead of only
      // existing in Vercel's function logs.
      const referenceId = await logError({
        error: err,
        route: "/api/admin/rentals/sweep-timeouts",
        userId: rental.user_id,
        context: { rentalId: rental.id, provider: rental.provider, daisyId: rental.daisy_id },
      });
      await admin
        .from("rentals")
        .update({
          cancel_error: `${String(err.code || err.message || "unknown error").slice(0, 450)} (ref ${referenceId})`,
        })
        .eq("id", rental.id);
      results.errors++;
      return;
    }

    if (isDaisyConnectivityFailure) {
      const referenceId = await logError({
        error: err,
        route: "/api/admin/rentals/sweep-timeouts",
        userId: rental.user_id,
        context: { rentalId: rental.id, provider: rental.provider, daisyId: rental.daisy_id, bypassed: true },
      });
      unconfirmedCancelNote =
        `Cancelled + refunded locally without confirmed DaisySMS cancellation — provider unreachable ` +
        `(${err.code}, ref ${referenceId}). DaisySMS's own dashboard may still show this number as active.`;
      // Falls through to the normal claim+refund logic below, exactly as if
      // the cancel had succeeded — providerRefundConfirmed stays true.
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
      // Null for a normal, fully-confirmed cancel; carries a note instead
      // when this went through the DaisySMS connectivity-failure bypass
      // above, so that distinction is never lost once the row is updated.
      cancel_error: unconfirmedCancelNote,
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
    const referenceId = await logError({
      error: err,
      route: "/api/admin/rentals/sweep-timeouts",
      userId: claimed.user_id,
      context: { rentalId: claimed.id, stage: "refund-after-cancel" },
    });
    await admin
      .from("rentals")
      .update({ refunded_at: null, cancel_error: `refund failed: ${err.message} (ref ${referenceId})`.slice(0, 500) })
      .eq("id", claimed.id);
    results.errors++;
  }
}
