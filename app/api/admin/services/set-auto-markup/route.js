import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Per-product control for the "Auto" toggle in ProductPriceRow. Turning
// autoMarkup on means every future services/sync (manual button or the
// hourly cron) recomputes this product's customer_price as DaisySMS's cost
// (in NGN) plus markupAmount, automatically — see services/sync/route.js.
// Turning it off leaves customer_price exactly as it is; the admin manages
// it by hand again via the price field + Save.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { serviceId, autoMarkup, markupAmount } = await request.json();
  if (!serviceId) {
    return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
  }

  const update = { auto_markup: Boolean(autoMarkup) };

  if (markupAmount !== undefined && markupAmount !== null && markupAmount !== "") {
    const amt = Number(markupAmount);
    if (!Number.isFinite(amt)) {
      return NextResponse.json({ error: "Enter a valid margin amount" }, { status: 400 });
    }
    update.markup_amount = amt;
  }

  const admin = createAdminClient();

  if (update.auto_markup && update.markup_amount === undefined) {
    // Turning auto on with no margin ever saved for this product — nothing
    // for sync to apply, so this would silently do nothing later. Fail loud
    // instead of pretending it worked.
    const { data: existing } = await admin
      .from("services")
      .select("markup_amount")
      .eq("id", serviceId)
      .maybeSingle();
    if (existing?.markup_amount == null) {
      return NextResponse.json(
        { error: "Set a margin amount before turning Auto on for this product." },
        { status: 400 }
      );
    }
  }

  const { error } = await admin.from("services").update(update).eq("id", serviceId);

  if (error) return NextResponse.json({ error: "Could not update service" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
