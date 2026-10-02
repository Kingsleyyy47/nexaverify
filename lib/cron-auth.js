import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Lets a scheduled job (pg_cron + pg_net, Vercel Cron, etc.) call an admin
// route without a logged-in browser session. The caller must send the
// CRON_SECRET value as an x-cron-secret header. Secrets in query strings
// leak into URL logs and browser history; pg_net supports headers directly.
//
// This is intentionally separate from admin login: a cron job has no user,
// so it can't satisfy the normal getSessionProfile()/isAdmin() check. This
// shared secret is the whole point of the check — keep it as secret as your
// database password.
export function isAuthorizedCron(request) {
  if (!process.env.CRON_SECRET) return false;

  const headerSecret = request.headers.get("x-cron-secret");
  if (!headerSecret) return false;
  const digest = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(headerSecret), digest(process.env.CRON_SECRET));
}
