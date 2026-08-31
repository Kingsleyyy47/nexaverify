import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Sets markup_ngn (a FLAT Naira amount added once per order) for a set of
// services — used by the "Markup" control on /admin/social-boost, scoped to
// whatever's currently visible (respects the search filter and platform
// tab), same as "Enable all"/"Disable all". This REPLACES whatever
// markup_ngn was there before for each affected service — it does not add on
// top of it, matching /admin/products' bulk Markup semantics exactly, so
// running it twice with the same amount is idempotent. This is what lets an
// admin set one number that "affects all" the currently visible services in
// one click, then go tweak any individual one afterward without it being
// overwritten again until Markup is run a second time.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { services, amount } = await request.json();
  const markup = Number(amount);

  if (!Array.isArray(services) || services.length === 0) {
    return NextResponse.json({ error: "services must be a non-empty array" }, { status: 400 });
  }
  if (!Number.isFinite(markup) || markup < 0) {
    return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
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
      enabled: prior?.enabled ?? true,
      favorite: Boolean(prior?.favorite),
      markup_ngn: markup,
      updated_at: now,
    };
  });

  const { error } = await admin.from("social_boost_overrides").upsert(updates, { onConflict: "service_id" });
  if (error) return NextResponse.json({ error: "Could not update prices" }, { status: 500 });

  return NextResponse.json({ ok: true, updated: updates.length });
}
