import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Upserts a single service override (favorite / enabled / markup) — see
// public.social_boost_overrides. One row per provider service id, created
// lazily the first time an admin touches any of its fields. Enabled/favorite
// toggles preserve whichever markup mode is already saved; only sending
// markupNgn writes markup_type: "flat", because typing a row-level Naira
// amount is an explicit choice to stop using the bulk percentage markup.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await request.json();
  const { serviceId, serviceName, enabled, favorite } = payload;
  const id = Number(serviceId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
  }
  const hasMarkupNgn = Object.prototype.hasOwnProperty.call(payload, "markupNgn");
  const markup = hasMarkupNgn ? Number(payload.markupNgn) : null;
  if (hasMarkupNgn && (!Number.isFinite(markup) || markup < 0)) {
    return NextResponse.json({ error: "Enter a valid markup amount" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: prior, error: priorError } = await admin
    .from("social_boost_overrides")
    .select("markup_type, markup_ngn, markup_percent")
    .eq("service_id", id)
    .maybeSingle();
  if (priorError) return NextResponse.json({ error: "Could not save" }, { status: 500 });

  const { data: updated, error } = await admin
    .from("social_boost_overrides")
    .upsert(
      {
        service_id: id,
        service_name: serviceName || null,
        enabled: Boolean(enabled),
        favorite: Boolean(favorite),
        markup_type: hasMarkupNgn ? "flat" : prior?.markup_type === "percent" ? "percent" : "flat",
        markup_ngn: hasMarkupNgn ? markup : Number(prior?.markup_ngn || 0),
        markup_percent: hasMarkupNgn ? 0 : Number(prior?.markup_percent || 0),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "service_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });

  return NextResponse.json({ override: updated });
}
