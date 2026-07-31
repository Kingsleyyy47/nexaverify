import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeLikePattern, isValidUsername, USERNAME_RULES_MESSAGE } from "@/lib/username";

// Lets an admin set or fix any user's username directly — covers the same
// signup race-condition recovery as /set-username, but without waiting on
// the affected customer to notice and log back in.
export async function POST(request, { params }) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  if (existing && existing.id !== params.id) {
    return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
  }

  const { data: updated, error } = await admin
    .from("profiles")
    .update({ username })
    .eq("id", params.id)
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Could not update username" }, { status: 500 });
  }

  return NextResponse.json({ username: updated.username });
}
