import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Lets a scheduled job (pg_cron + pg_net, Vercel Cron, etc.) call an admin
// route without a logged-in browser session. The caller must send the
// Vault credential as an x-cron-secret header. Secrets in query strings
// leak into URL logs and browser history; pg_net supports headers directly.
//
// This is intentionally separate from admin login: a cron job has no user,
// so it can't satisfy the normal getSessionProfile()/isAdmin() check. This
// shared secret is the whole point of the check — keep it as secret as your
// database password.
export async function isAuthorizedCron(request) {
  const headerSecret = request.headers.get("x-cron-secret");
  if (!headerSecret || headerSecret.length < 32 || headerSecret.length > 256) return false;
  // Check the current secret for every request so rotation revokes the old
  // credential immediately. Never fall back to an exposed environment value.
  const { data } = await createAdminClient().rpc("is_valid_cron_secret", { p_secret: headerSecret })
    .abortSignal(AbortSignal.timeout(10000)).throwOnError();
  return data === true;
}
