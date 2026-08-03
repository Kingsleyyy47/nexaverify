import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Upserts a single country+service override (favorite / disabled) — see
// public.daisysim_overrides. One row per combo, created lazily the first
// time an admin toggles either flag for it.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { countryId, countryName, serviceCode, serviceName, favorite, disabled } = await request.json();
  if (!countryId || !serviceCode) {
    return NextResponse.json({ error: "countryId and serviceCode are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("daisysim_overrides")
    .upsert(
      {
        country_id: countryId,
        country_name: countryName || countryId,
        service_code: serviceCode,
        service_name: serviceName || serviceCode,
        favorite: Boolean(favorite),
        disabled: Boolean(disabled),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "country_id,service_code" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });

  return NextResponse.json({ override: updated });
}
