import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncLtrsIntoDb } from "@/lib/ltr-sync";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Callable two ways: by a logged-in admin (button click in /admin/numbers),
// or by a scheduled job carrying CRON_SECRET (see lib/cron-auth.js and
// supabase/cron.sql) — that's what lets renewal charges happen automatically
// on a timer instead of only when someone remembers to click the button.
export async function POST(request) {
  if (!isAuthorizedCron(request)) {
    const { user, profile } = await getSessionProfile();
    if (!user || !isAdmin(profile)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const admin = createAdminClient();
  try {
    const result = await syncLtrsIntoDb(admin);
    return NextResponse.json(result);
  } catch (err) {
    // Include the real error message (DaisySMS error code, JSON parse
    // failure, etc.) instead of a generic string — this endpoint is only
    // ever called by an admin or a cron job carrying the shared secret,
    // never by a customer, so it's safe to be specific here.
    return NextResponse.json(
      { error: `Could not reach DaisySMS: ${err.message || err.code || "unknown error"}` },
      { status: 502 }
    );
  }
}
