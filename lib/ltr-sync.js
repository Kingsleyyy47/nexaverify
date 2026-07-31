import "server-only";
import { getLtrs, setAutoRenew as daisySetAutoRenew } from "@/lib/daisy";

function normalizePeriodType(type) {
  if (!type) return null;
  const t = String(type).toUpperCase();
  return ["H", "D", "M"].includes(t) ? t : null;
}

// Rough period length in ms. "M" (month) is approximated as 30 days — fine
// for computing how many billing periods elapsed, not for exact calendars.
function periodLengthMs(periodDuration, periodType) {
  const n = Number(periodDuration) || 1;
  const unitMs = { H: 3_600_000, D: 86_400_000, M: 30 * 86_400_000 }[periodType];
  return unitMs ? n * unitMs : null;
}

// Pulls the authoritative long-term-rental list from DaisySMS (GET /api/ltrs)
// and:
//   1. writes paid_until / auto_renew / daily_price / renewable / period info
//      onto matching rows in public.rentals (matched by daisy_id)
//   2. charges the customer's NexaVerify wallet, in NGN, for however many
//      renewal periods just elapsed (paid_until moved forward since our last
//      sync) — converting DaisySMS's USD daily_price using the admin-set
//      "hard rate" from public.currency_rates, so no admin ever has to
//      hand-adjust a balance to true this up.
//   3. if a charge fails for insufficient wallet balance, immediately turns
//      auto_renew OFF on both DaisySMS and our own record — so the customer
//      never gets surprise repeated charge attempts, and the number simply
//      expires at the end of its current paid period instead.
//   4. if NO USD rate has been set yet in /admin/currency, any rental that
//      would otherwise need a charge is left completely untouched (not
//      charged, not marked as renewed) so nothing is billed in the wrong
//      currency — it'll be caught correctly on the next sync once a rate
//      exists. Check the returned `skipped` count for this.
export async function syncLtrsIntoDb(admin) {
  const { data: usdRateRow } = await admin
    .from("currency_rates")
    .select("ngn_per_unit")
    .eq("currency", "USD")
    .maybeSingle();
  const usdRate = usdRateRow ? Number(usdRateRow.ngn_per_unit) : null;

  const ltrs = await getLtrs();
  let updated = 0;
  let charged = 0;
  let skipped = 0;

  for (const ltr of ltrs || []) {
    const daisyId = String(ltr.id);
    const { data: rental } = await admin
      .from("rentals")
      .select("*")
      .eq("daisy_id", daisyId)
      .maybeSingle();

    if (!rental) continue;

    const newPaidUntilMs = ltr.paid_until ? ltr.paid_until * 1000 : null;
    const priorPaidUntilMs = rental.paid_until ? new Date(rental.paid_until).getTime() : null;
    const dailyPriceUsd = ltr.daily_price != null ? Number(ltr.daily_price) : null;
    const periodMs = periodLengthMs(ltr.period_duration, ltr.period_type);

    // Work out how many renewal periods just elapsed, if any.
    let elapsedPeriods = 0;
    if (dailyPriceUsd && periodMs && newPaidUntilMs) {
      if (priorPaidUntilMs == null) {
        elapsedPeriods = 1; // first activation
      } else if (newPaidUntilMs > priorPaidUntilMs) {
        elapsedPeriods = Math.max(1, Math.round((newPaidUntilMs - priorPaidUntilMs) / periodMs));
      }
    }

    if (elapsedPeriods > 0 && !usdRate) {
      // A charge is due but we have no USD->NGN rate to bill it correctly.
      // Skip entirely — don't advance paid_until either — so the next sync
      // (once a rate is set in /admin/currency) charges the full amount.
      skipped += 1;
      continue;
    }

    let autoRenewToWrite = Boolean(ltr.auto_renew);
    const dailyPriceNgn = usdRate && dailyPriceUsd != null ? dailyPriceUsd * usdRate : null;

    if (elapsedPeriods > 0) {
      const amountNgn = elapsedPeriods * dailyPriceUsd * usdRate;
      const { error: chargeError } = await admin.rpc("adjust_balance", {
        p_user_id: rental.user_id,
        p_amount: -amountNgn,
        p_type: "purchase",
        p_reference_id: rental.id,
        p_note: `Long-term rental renewal (${elapsedPeriods} period${elapsedPeriods > 1 ? "s" : ""}) for ${rental.service_id} ${rental.phone_number}`,
        p_created_by: null,
      });

      if (chargeError) {
        // Customer's wallet couldn't cover it — stop future auto-charges
        // rather than letting DaisySMS keep billing our master account
        // for a customer who can't pay. No admin balance edit involved.
        try {
          await daisySetAutoRenew(daisyId, false);
        } catch {
          // best effort — we still turn it off on our side below
        }
        autoRenewToWrite = false;
      } else {
        charged += 1;
      }
    }

    await admin
      .from("rentals")
      .update({
        daily_price: dailyPriceNgn,
        auto_renew: autoRenewToWrite,
        renewable: ltr.renewable !== false,
        paid_until: newPaidUntilMs ? new Date(newPaidUntilMs).toISOString() : null,
        period_duration: ltr.period_duration ?? null,
        period_type: normalizePeriodType(ltr.period_type),
        updated_at: new Date().toISOString(),
      })
      .eq("id", rental.id);

    updated += 1;
  }

  return { total: (ltrs || []).length, updated, charged, skipped };
}
