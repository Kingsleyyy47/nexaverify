import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeLikePattern, isValidUsername, USERNAME_RULES_MESSAGE } from "@/lib/username";

// Lets a LOGGED-IN visitor set their own username — the recovery path for
// the rare signup race condition that can leave an account with none (see
// handle_new_user() in schema.sql), enforced via middleware.js redirecting
// anyone with no username to /set-username. Uses the service role because
// profiles has no client-side update policy on purpose (see schema.sql) —
// this route enforces "only your own row" itself instead.
export async function POST(request) {
  const { user } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { username } = await request.json();
  if (!isValidUsername(username)) {
    return NextResponse.json({ error: USERNAME_RULES_MESSAGE }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", escapeLikePattern(username))
    .maybeSingle();

  if (existing && existing.id !== user.id) {
    return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
  }

  const { error } = await admin.from("profiles").update({ username }).eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: "Could not save username" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
