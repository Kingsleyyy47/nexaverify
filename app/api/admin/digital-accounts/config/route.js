import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Single switch — see the big comment on public.digital_accounts_config in
// schema.sql for why there's no separate "enabled" here the way
// istar_config/social_boost_config have.
export async function POST(request) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { customerVisible } = await request.json();

  const admin = createAdminClient();
  const { error } = await admin
    .from("digital_accounts_config")
    .upsert(
      { id: true, customer_visible: Boolean(customerVisible), updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );

  if (error) {
    return NextResponse.json({ error: "Could not save settings" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
