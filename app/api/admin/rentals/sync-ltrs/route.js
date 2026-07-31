import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { isAuthorizedCron } from "@/lib/cron-auth";

// PAUSED (2026-07-31): this route used to call syncLtrsIntoDb(), which
// pulls the "authoritative" long-term-rental list from DaisySMS's GET
// /api/ltrs and auto-charges renewal fees. Live testing proved that
// endpoint is a .com-only web dashboard route — on .io it redirects to the
// login page instead of returning JSON, and .io's own published API docs
// (daisysms.io/docs/api) don't document any bulk list/expiry-check action
// at all (only getNumber/getStatus/setStatus). There is currently no real
// DaisySMS endpoint on this account to sync against, so automatic renewal
// billing is paused rather than left calling a broken endpoint on a timer.
// The scheduled job in supabase/cron.sql has been commented out to match.
// Admins should track/renew long-term rentals manually via /admin/numbers
// until a working sync source exists — see lib/ltr-sync.js for the parked
// implementation (kept for reference, not called from here anymore).
export async function POST(request) {
  if (!isAuthorizedCron(request)) {
    const { user, profile } = await getSessionProfile();
    if (!user || !isAdmin(profile)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({
    paused: true,
    total: 0,
    updated: 0,
    charged: 0,
    skipped: 0,
    message:
      "LTR auto-sync is paused: DaisySMS has no working list/expiry endpoint for this account. Manage long-term rentals manually for now.",
  });
}
