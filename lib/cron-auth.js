import "server-only";

// Lets a scheduled job (pg_cron + pg_net, Vercel Cron, etc.) call an admin
// route without a logged-in browser session. The caller must send the
// CRON_SECRET value either as a header (`x-cron-secret`) or a query string
// param (`cron_secret`) — pg_net can only set a handful of things easily, so
// supporting both makes the SQL side simpler either way.
//
// This is intentionally separate from admin login: a cron job has no user,
// so it can't satisfy the normal getSessionProfile()/isAdmin() check. This
// shared secret is the whole point of the check — keep it as secret as your
// database password.
export function isAuthorizedCron(request) {
  if (!process.env.CRON_SECRET) return false;

  const headerSecret = request.headers.get("x-cron-secret");
  const querySecret = request.nextUrl.searchParams.get("cron_secret");

  return headerSecret === process.env.CRON_SECRET || querySecret === process.env.CRON_SECRET;
}
