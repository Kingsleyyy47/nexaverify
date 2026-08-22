import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const {
    enabled,
    customerVisible,
    ngnPerStar,
    starFlatMarkupUnder1000Ngn,
    starFlatMarkupOver1000Ngn,
    premiumMarkup3,
    premiumMarkup6,
    premiumMarkup12,
  } = await request.json();
  const perStar = Number(ngnPerStar);
  const flatMarkupUnder1000 = Number(starFlatMarkupUnder1000Ngn);
  const flatMarkupOver1000 = Number(starFlatMarkupOver1000Ngn);
  const markup3 = Number(premiumMarkup3);
  const markup6 = Number(premiumMarkup6);
  const markup12 = Number(premiumMarkup12);

  if (!Number.isFinite(perStar) || perStar < 0) {
    return NextResponse.json({ error: "Enter a valid starting price per star" }, { status: 400 });
  }
  if (!Number.isFinite(flatMarkupUnder1000) || flatMarkupUnder1000 < 0) {
    return NextResponse.json({ error: "Enter a valid flat markup for orders under 1,000 stars" }, { status: 400 });
  }
  if (!Number.isFinite(flatMarkupOver1000) || flatMarkupOver1000 < 0) {
    return NextResponse.json({ error: "Enter a valid flat markup for orders of 1,000+ stars" }, { status: 400 });
  }
  for (const [label, value] of [
    ["3-month", markup3],
    ["6-month", markup6],
    ["12-month", markup12],
  ]) {
    if (!Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: `Enter a valid ${label} markup amount` }, { status: 400 });
    }
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("istar_config")
    .update({
      enabled: Boolean(enabled),
      customer_visible: Boolean(customerVisible),
      ngn_per_star: perStar,
      star_flat_markup_under_1000_ngn: flatMarkupUnder1000,
      star_flat_markup_1000_plus_ngn: flatMarkupOver1000,
      premium_markup_3: markup3,
      premium_markup_6: markup6,
      premium_markup_12: markup12,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Could not save settings" }, { status: 500 });

  return NextResponse.json({ config: updated });
}
