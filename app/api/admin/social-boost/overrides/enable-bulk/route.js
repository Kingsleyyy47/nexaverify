import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Bulk version of /api/admin/social-boost/overrides — used by "Enable all"
// on /admin/social-boost, scoped to whatever's currently visible (respects
// the search filter, same as DaisySMS's equivalent). Only touches `enabled`
// — favorite/markup on any existing override row are preserved, which is
// why existing rows are fetched first rather than blind-upserting a full row
// (upsert replaces every column, not just the one being changed).
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { services } = await request.json();
  if (!Array.isArray(services) || services.length === 0) {
    return NextResponse.json({ error: "services must be a non-empty array" }, { status: 400 });
  }

  const admin = createAdminClient();
  const ids = services.map((s) => Number(s.serviceId)).filter((id) => Number.isInteger(id));

  const { data: existing } = await admin.from("social_boost_overrides").select("*").in("service_id", ids);
  const existingMap = new Map((existing || []).map((o) => [o.service_id, o]));

  const now = new Date().toISOString();
  const updates = services.map((s) => {
    const id = Number(s.serviceId);
    const prior = existingMap.get(id);
    return {
      service_id: id,
      service_name: s.serviceName || prior?.service_name || null,
      enabled: true,
      favorite: Boolean(prior?.favorite),
      markup_ngn: Number(prior?.markup_ngn || 0),
      updated_at: now,
    };
  });

  const { error } = await admin.from("social_boost_overrides").upsert(updates, { onConflict: "service_id" });
  if (error) return NextResponse.json({ error: "Could not update services" }, { status: 500 });

  return NextResponse.json({ ok: true, updated: updates.length });
}
