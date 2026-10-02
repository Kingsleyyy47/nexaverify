import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Returns { user, profile, profileError } for the currently logged-in
// visitor, or { user: null, profile: null } if nobody is logged in. `profile`
// is the row from public.profiles (balance, role, email).
//
// Keep the query error distinct from an actual zero balance. Callers that
// display account data should show an unavailable state on an error.
export async function getSessionProfile() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null, profileError: null, supabase };
  }

  // Auth has verified the visitor above. Read only that visitor's profile
  // with the server-side key so a broken/missing SELECT policy cannot make
  // an existing balance or admin role appear to be zero/missing.
  const { data: profile, error: profileError } = await createAdminClient()
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Temporary Oct 2026 diagnostic: profileError alone doesn't say WHY the
  // lookup failed (expired JWT vs. connection timeout vs. something else),
  // and nothing logged that detail anywhere before now. This prints the full
  // Supabase error (code, message, details) to the server console so it
  // shows up in Vercel's runtime logs the next time this fires, instead of
  // just flipping on the "couldn't load" banner with no trace of why.
  if (profileError) {
    console.error("[getSessionProfile] profile lookup failed", {
      userId: user.id,
      code: profileError.code,
      message: profileError.message,
      details: profileError.details,
      hint: profileError.hint,
    });
  }

  return { user, profile, profileError, supabase };
}

// Throws-free guard for use at the top of admin Server Components / Route
// Handlers. Returns true only if the visitor is logged in AND role='admin'.
export function isAdmin(profile) {
  return Boolean(profile && profile.role === "admin");
}
