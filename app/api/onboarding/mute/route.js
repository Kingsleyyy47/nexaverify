import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Suppresses the welcome popup for the current user for 24 hours — see
// profiles.onboarding_muted_until. This is the ONLY thing that persists
// anything: a plain X/"Get Started" close is deliberately not saved
// anywhere, so the popup shows again on the customer's next dashboard visit.
// Uses the service role because profiles has no client-side update policy on
// purpose (see schema.sql); this route enforces "only your own row" itself,
// same pattern as /api/auth/set-username.
export async function POST() {
  const { user } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const mutedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ onboarding_muted_until: mutedUntil })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });

  return NextResponse.json({ ok: true, mutedUntil });
}
