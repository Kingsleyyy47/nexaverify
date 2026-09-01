import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Bulk-sets markup_ngn for every service currently shown, replacing
// whatever markup (or lack of one — i.e. still inheriting the global
// default) was there before, same "replace, don't add on top" behavior as
// DaisySMS's Products bulk Markup. Preserves favorite/disabled per service —
// see enable-bulk/route.js for why the full row has to be re-sent on upsert.
export async function POST(request) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { services, amount } = await request.json();
  const margin = Number(amount);

  if (!Array.isArray(services) || services.length === 0) {
    return NextResponse.json({ error: "services must be a non-empty array" }, { status: 400 });
  }
  if (!Number.isFinite(margin)) {
    return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
  }

  const admin = createAdminClient();
  const codes = services.map((s) => s.serviceCode);
  const { data: existing } = await admin
    .from("daisysim_usa_overrides")
    .select("*")
    .in("service_code", codes);
  const existingMap = new Map((existing || []).map((o) => [o.service_code, o]));

  const rows = services.map((s) => {
    const prior = existingMap.get(s.serviceCode);
    return {
      service_code: s.serviceCode,
      service_name: s.serviceName || prior?.service_name || s.serviceCode,
      favorite: prior?.favorite ?? false,
      disabled: prior?.disabled ?? false,
      markup_ngn: margin,
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await admin.from("daisysim_usa_overrides").upsert(rows, { onConflict: "service_code" });
  if (error) return NextResponse.json({ error: "Could not update markup" }, { status: 500 });

  return NextResponse.json({ ok: true, updated: rows.length });
}
