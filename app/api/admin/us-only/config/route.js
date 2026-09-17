import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { enabled, markupAmountNgn, backend } = await request.json();
  const markup = Number(markupAmountNgn);

  if (!Number.isFinite(markup) || markup < 0) {
    return NextResponse.json({ error: "Enter a valid markup amount" }, { status: 400 });
  }
  // Only two valid backends — Getatext (the default) or DaisySim's dedicated
  // USA "server7" API (lib/daisysimUsa.js). Falls back to "getatext" for any
  // other/missing value rather than rejecting the request, same fail-safe
  // spirit as the schema's own check constraint.
  const resolvedBackend = backend === "daisysim" ? "daisysim" : "getatext";

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("daisysim_usa_config")
    .update({
      enabled: Boolean(enabled),
      markup_amount_ngn: markup,
      backend: resolvedBackend,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Could not save settings" }, { status: 500 });

  return NextResponse.json({ config: updated });
}
