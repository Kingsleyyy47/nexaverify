import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Sets customer_price (NGN — what customers actually pay) for a set of
// services to DaisySMS's own cost (last_price, USD, converted to NGN using
// the admin-set USD rate) plus a flat margin. Used by the "Markup" control
// on /admin/products, scoped to whatever's currently visible (respects the
// search filter), same as "Enable all"/"Disable all". This recomputes the
// price from cost every time it's run — it does NOT add to whatever
// customer_price happened to be before, so running it twice with the same
// margin is idempotent rather than compounding.
//
// Always saves `markup_amount` on each affected service, regardless of
// `auto` — that's what lets a product's per-row "Auto" toggle be flipped on
// later without having to re-enter the margin. If `auto: true` is passed,
// this ALSO turns auto_markup on for the same batch, so every future sync
// (manual button or the hourly cron) keeps re-applying this same margin on
// top of DaisySMS's latest cost automatically — see services/sync/route.js.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { serviceIds, amount, auto } = await request.json();
  const margin = Number(amount);

  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    return NextResponse.json({ error: "serviceIds must be a non-empty array" }, { status: 400 });
  }
  if (!Number.isFinite(margin)) {
    return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: usdRateRow } = await admin
    .from("currency_rates")
    .select("ngn_per_unit")
    .eq("currency", "USD")
    .maybeSingle();
  const usdRate = usdRateRow ? Number(usdRateRow.ngn_per_unit) : null;

  if (!usdRate) {
    return NextResponse.json(
      { error: "Set a USD rate in Currency rates first — needed to convert DaisySMS's cost to Naira." },
      { status: 400 }
    );
  }

  const { data: rows, error: fetchError } = await admin
    .from("services")
    .select("id, name, last_price")
    .in("id", serviceIds);

  if (fetchError) {
    return NextResponse.json({ error: "Could not load services" }, { status: 500 });
  }

  const updates = (rows || []).map((r) => {
    const costNgn = Number(r.last_price || 0) * usdRate;
    return {
      id: r.id,
      // NOT NULL with no default — must be carried through on every row or
      // Postgres rejects the whole upsert (see services/sync/route.js for
      // the same gotcha explained in more detail).
      name: r.name,
      customer_price: Math.max(0, Math.round((costNgn + margin) * 100) / 100),
      markup_amount: margin,
      ...(auto ? { auto_markup: true } : {}),
    };
  });

  if (updates.length > 0) {
    const { error } = await admin.from("services").upsert(updates, { onConflict: "id" });
    if (error) {
      return NextResponse.json({ error: "Could not update prices" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, updated: updates.length });
}
