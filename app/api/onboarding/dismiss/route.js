import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Marks the welcome popup as seen for the current user, permanently — see
// profiles.onboarding_seen_at. Uses the service role because profiles has no
// client-side update policy on purpose (see schema.sql); this route enforces
// "only your own row" itself, same pattern as /api/auth/set-username.
export async function POST() {
  const { user } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ onboarding_seen_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
