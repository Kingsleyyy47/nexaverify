import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Upserts a single service override (favorite / disabled / markup_ngn) — see
// public.daisysim_usa_overrides. One row per service code, created lazily
// the first time an admin touches any flag for it. No country dimension
// (unlike /api/admin/international/overrides) since this provider is
// USA-only.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { serviceCode, serviceName, favorite, disabled, markupNgn } = await request.json();
  if (!serviceCode) {
    return NextResponse.json({ error: "serviceCode is required" }, { status: 400 });
  }

  let markup_ngn = null;
  if (markupNgn !== undefined && markupNgn !== null && markupNgn !== "") {
    const amt = Number(markupNgn);
    if (!Number.isFinite(amt)) {
      return NextResponse.json({ error: "Enter a valid markup amount" }, { status: 400 });
    }
    markup_ngn = amt;
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
        markup_ngn,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "service_code" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });

  return NextResponse.json({ override: updated });
}
