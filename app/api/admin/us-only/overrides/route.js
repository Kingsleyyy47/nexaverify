import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Upserts a single service override (favorite / disabled) — see
// public.daisysim_usa_overrides. One row per service code, created lazily
// the first time an admin toggles either flag for it. No country dimension
// (unlike /api/admin/international/overrides) since this provider is
// USA-only.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { serviceCode, serviceName, favorite, disabled } = await request.json();
  if (!serviceCode) {
    return NextResponse.json({ error: "serviceCode is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("daisysim_usa_overrides")
    .upsert(
      {
        service_code: serviceCode,
        service_name: serviceName || serviceCode,
        favorite: Boolean(favorite),
        disabled: Boolean(disabled),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "service_code" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });

  return NextResponse.json({ override: updated });
}
