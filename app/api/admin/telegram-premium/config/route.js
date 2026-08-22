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
    starMarkupUnder1000Ngn,
    starMarkupOver1000Ngn,
    premiumMarkup3,
    premiumMarkup6,
    premiumMarkup12,
  } = await request.json();
  const perStar = Number(ngnPerStar);
  const starMarkupUnder1000 = Number(starMarkupUnder1000Ngn);
  const starMarkupOver1000 = Number(starMarkupOver1000Ngn);
  const markup3 = Number(premiumMarkup3);
  const markup6 = Number(premiumMarkup6);
  const markup12 = Number(premiumMarkup12);

  if (!Number.isFinite(perStar) || perStar < 0) {
    return NextResponse.json({ error: "Enter a valid starting price per star" }, { status: 400 });
  }
  if (!Number.isFinite(starMarkupUnder1000) || starMarkupUnder1000 < 0) {
    return NextResponse.json({ error: "Enter a valid markup for under 1,000 stars" }, { status: 400 });
  }
  if (!Number.isFinite(starMarkupOver1000) || starMarkupOver1000 < 0) {
    return NextResponse.json({ error: "Enter a valid markup for 1,000+ stars" }, { status: 400 });
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
      star_markup_under_1000_ngn: starMarkupUnder1000,
      star_markup_1000_plus_ngn: starMarkupOver1000,
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
