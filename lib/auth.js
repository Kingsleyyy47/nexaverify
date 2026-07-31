import "server-only";
import { createClient } from "@/lib/supabase/server";

// Returns { user, profile } for the currently logged-in visitor, or
// { user: null, profile: null } if nobody is logged in. `profile` is the row
// from public.profiles (balance, role, email).
export async function getSessionProfile() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null, supabase };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return { user, profile, supabase };
}

// Throws-free guard for use at the top of admin Server Components / Route
// Handlers. Returns true only if the visitor is logged in AND role='admin'.
export function isAdmin(profile) {
  return Boolean(profile && profile.role === "admin");
}
