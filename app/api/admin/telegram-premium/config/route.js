import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { enabled, customerVisible, ngnPerStar, markupAmountNgn } = await request.json();
  const perStar = Number(ngnPerStar);
  const markup = Number(markupAmountNgn);

  if (!Number.isFinite(perStar) || perStar < 0) {
    return NextResponse.json({ error: "Enter a valid price per star" }, { status: 400 });
  }
  if (!Number.isFinite(markup) || markup < 0) {
    return NextResponse.json({ error: "Enter a valid markup amount" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("istar_config")
    .update({
      enabled: Boolean(enabled),
      customer_visible: Boolean(customerVisible),
      ngn_per_star: perStar,
      markup_amount_ngn: markup,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Could not save settings" }, { status: 500 });

  return NextResponse.json({ config: updated });
}
