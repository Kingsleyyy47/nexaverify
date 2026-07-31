import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeLikePattern } from "@/lib/username";

// Customers log in with a USERNAME, but Supabase Auth itself only knows
// email/password. So: look up the email tied to that username (service role
// — RLS would otherwise block an anonymous visitor from reading anyone
// else's profile row, on purpose), then sign in with that email behind the
// scenes. The session cookie gets set on this route's response via the
// normal @supabase/ssr cookie plumbing (lib/supabase/server.js), exactly
// like it would from a client-side signInWithPassword call.
//
// Edge case: a rare signup race condition can leave an account with NO
// username set (see the exception handler in handle_new_user() in
// schema.sql) — which would otherwise permanently lock that person out,
// since there'd be no username to type in. So if the username lookup comes
// up empty AND what was typed looks like an email address, we also try
// signing in with it directly as an email. Once logged in, middleware.js
// redirects anyone with no username to /set-username before letting them
// use the rest of the site.
export async function POST(request) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .ilike("username", escapeLikePattern(username))
    .maybeSingle();

  const emailToUse = profile?.email || (username.includes("@") ? username : null);

  // Deliberately the same generic error whether the username/email doesn't
  // exist or the password is wrong — don't give an attacker a way to tell
  // which accounts are registered.
  if (!emailToUse) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: emailToUse,
    password,
  });

  if (error) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
