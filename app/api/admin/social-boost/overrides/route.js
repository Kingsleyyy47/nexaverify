import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Upserts a single service override (favorite / enabled / markup) — see
// public.social_boost_overrides. One row per provider service id, created
// lazily the first time an admin touches any of its three fields. All three
// fields are always sent together (not just the one being changed) — same
// reasoning as /api/admin/us-only/overrides: a partial upsert would silently
// null out whichever field wasn't included.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { serviceId, serviceName, enabled, favorite, markupNgn } = await request.json();
  const id = Number(serviceId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
  }
  const markup = Number(markupNgn);
  if (!Number.isFinite(markup) || markup < 0) {
    return NextResponse.json({ error: "Enter a valid markup amount" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("social_boost_overrides")
    .upsert(
      {
        service_id: id,
        service_name: serviceName || null,
        enabled: Boolean(enabled),
        favorite: Boolean(favorite),
        markup_ngn: markup,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "service_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });

  return NextResponse.json({ override: updated });
}
