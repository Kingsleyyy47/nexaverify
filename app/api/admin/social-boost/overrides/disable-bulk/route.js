import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Mirror of enable-bulk — only touches `enabled`, preserving favorite/markup
// (including markup_type/markup_percent — see schema.sql).
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
  const ids = services.map((s) => Number(s.serviceId)).filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length !== services.length) {
    return NextResponse.json({ error: "Every service needs a valid service ID" }, { status: 400 });
  }

  const { data: existing } = await admin.from("social_boost_overrides").select("*").in("service_id", ids);
  const existingMap = new Map((existing || []).map((o) => [o.service_id, o]));

  const now = new Date().toISOString();
  const updates = services.map((s) => {
    const id = Number(s.serviceId);
    const prior = existingMap.get(id);
    return {
      service_id: id,
      service_name: s.serviceName || prior?.service_name || null,
      enabled: false,
      favorite: Boolean(prior?.favorite),
      markup_type: prior?.markup_type === "percent" ? "percent" : "flat",
      markup_ngn: Number(prior?.markup_ngn || 0),
      markup_percent: Number(prior?.markup_percent || 0),
      updated_at: now,
    };
  });

  const { error } = await admin.from("social_boost_overrides").upsert(updates, { onConflict: "service_id" });
  if (error) return NextResponse.json({ error: "Could not update services" }, { status: 500 });

  return NextResponse.json({ ok: true, updated: updates.length });
}
