import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Bulk version of /api/admin/services/toggle (enabled: false) — used by the
// "Disable all" button on /admin/products, scoped to whatever's currently
// visible (respects the search filter), same as "Enable all"/"Markup".
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { serviceIds } = await request.json();
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    return NextResponse.json({ error: "serviceIds must be a non-empty array" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("services").update({ enabled: false }).in("id", serviceIds);

  if (error) return NextResponse.json({ error: "Could not update services" }, { status: 500 });

  return NextResponse.json({ ok: true, updated: serviceIds.length });
}
