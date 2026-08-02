import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { enabled, markupAmountNgn } = await request.json();
  const markup = Number(markupAmountNgn);

  if (!Number.isFinite(markup) || markup < 0) {
    return NextResponse.json({ error: "Enter a valid markup amount" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("daisysim_config")
    .update({
      enabled: Boolean(enabled),
      markup_amount_ngn: markup,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Could not save settings" }, { status: 500 });

  return NextResponse.json({ config: updated });
}
