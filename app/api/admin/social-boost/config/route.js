import { readObjectBody } from "@/lib/request-body.mjs";
import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requestBody = await readObjectBody(request);
  if (!requestBody) return NextResponse.json({ error: "Send a valid JSON object." }, { status: 400 });
  const { enabled, customerVisible } = requestBody;

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("social_boost_config")
    .update({
      enabled: Boolean(enabled),
      customer_visible: Boolean(customerVisible),
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Could not save settings" }, { status: 500 });

  return NextResponse.json({ config: updated });
}
