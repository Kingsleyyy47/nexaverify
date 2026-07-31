import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeLikePattern, isValidUsername, USERNAME_RULES_MESSAGE } from "@/lib/username";

export async function POST(request) {
  const { username, email, password } = await request.json();

  if (!isValidUsername(username)) {
    return NextResponse.json({ error: USERNAME_RULES_MESSAGE }, { status: 400 });
  }
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Pre-check uniqueness so we can give a friendly error instead of a raw
  // database conflict. The trigger in schema.sql still guards against a
  // race condition where two people submit the same username at once.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", escapeLikePattern(username))
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });

  if (error) {
    return NextResponse.json({ error: error.message || "Could not create account" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
