import "server-only";
import { createClient } from "@/lib/supabase/server";

// Returns { user, profile, profileError } for the currently logged-in
// visitor, or { user: null, profile: null } if nobody is logged in. `profile`
// is the row from public.profiles (balance, role, email).
//
// Oct 2026 incident: this used to drop the query's `error` entirely, so a
// failed profile lookup (Supabase API Gateway degradation, a rejected JWT,
// any transient issue) came back as `profile: undefined` — indistinguishable
// from "this visitor genuinely has no profile row". Everything downstream
// that reads `profile?.balance` or calls `isAdmin(profile)` then silently
// showed ₦0 balance and "not an admin" during an outage, with nothing on
// screen to say the data failed to load rather than actually being empty.
// Callers that display account data should check `profileError` and show a
// "couldn't load, try refreshing" state instead of trusting a zeroed
// `profile` at face value.
export async function getSessionProfile() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null, profileError: null, supabase };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return { user, profile, profileError, supabase };
}

// Throws-free guard for use at the top of admin Server Components / Route
// Handlers. Returns true only if the visitor is logged in AND role='admin'.
export function isAdmin(profile) {
  return Boolean(profile && profile.role === "admin");
}
