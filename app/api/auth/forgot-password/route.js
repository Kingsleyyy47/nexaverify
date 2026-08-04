import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeLikePattern } from "@/lib/username";

// Sends a Supabase password-recovery email. Customers sign in with a
// USERNAME (see /api/auth/login), so this accepts either a username (looked
// up to its email via the service role, same as login) or an email typed
// directly. Always returns the same generic success response either way —
// never reveals whether a given username/email actually has an account,
// same reasoning as the "Invalid username or password" login error.
export async function POST(request) {
  const { identifier } = await request.json();
  if (!identifier) {
    return NextResponse.json({ error: "Enter your username or email" }, { status: 400 });
  }

  const GENERIC_OK = {
    ok: true,
    message: "If an account exists for that username or email, a reset link is on its way.",
  };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .ilike("username", escapeLikePattern(identifier))
    .maybeSingle();

  const emailToUse = profile?.email || (identifier.includes("@") ? identifier : null);
  if (!emailToUse) {
    // Nothing to send to — still return the generic response so this can't
    // be used to enumerate which usernames exist.
    return NextResponse.json(GENERIC_OK);
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
  const supabase = createClient();
  await supabase.auth.resetPasswordForEmail(emailToUse, {
    redirectTo: `${siteUrl}/reset-password`,
  });
  // Deliberately not checking the error here either — same reasoning as
  // above, and Supabase itself rate-limits/handles unknown emails safely.

  return NextResponse.json(GENERIC_OK);
}
