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
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // full_name is purely cosmetic: it's the field Supabase's own Auth
      // dashboard ("Users" table, "Display name" column) reads — it's
      // unrelated to how the app itself resolves usernames (that's always
      // via public.profiles, looked up server-side in /api/auth/login).
      // Set it so the dashboard is legible without hand-editing anything.
      data: { username, full_name: username },
      // Point the "confirm your email" link at whichever domain this signup
      // actually happened on (localhost while developing, the .vercel.app
      // preview while testing, nexaverify.org once that's live) instead of
      // Supabase's fixed Site URL setting — so nobody has to remember to
      // flip that setting every time the environment changes. Supabase only
      // honors this if the domain is also listed in Authentication -> URL
      // Configuration -> Redirect URLs.
      emailRedirectTo: `${request.nextUrl.origin}/login`,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message || "Could not create account" }, { status: 400 });
  }

  if (data.user?.id) {
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: data.user.id,
        email,
        username,
      },
      { onConflict: "id" }
    );

    if (profileError) {
      return NextResponse.json(
        { error: "Account was created, but the user profile could not be saved." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}
