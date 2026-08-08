import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Single route for the /admin/providers overview page's four master
// switches. Each one writes to the SAME config table/column its own
// dedicated settings page already uses (public.daisysms_config.enabled,
// public.daisysim_config.enabled, public.daisysim_usa_config.enabled,
// public.pocketfi_config.virtual_account_enabled) — this is just a second,
// faster place to flip them, not a separate source of truth.
// /admin/international, /admin/us-only, and /admin/pocketfi still work
// exactly as before for the detailed settings (markup, bank).
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { daisysmsEnabled, daisysimEnabled, usOnlyEnabled, pocketfiVirtualAccountEnabled } = await request.json();

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const [daisysms, daisysim, usOnly, pocketfi] = await Promise.all([
    admin
      .from("daisysms_config")
      .update({ enabled: Boolean(daisysmsEnabled), updated_at: now })
      .eq("id", true)
      .select()
      .single(),
    admin
      .from("daisysim_config")
      .update({ enabled: Boolean(daisysimEnabled), updated_at: now })
      .eq("id", true)
      .select()
      .single(),
    admin
      .from("daisysim_usa_config")
      .update({ enabled: Boolean(usOnlyEnabled), updated_at: now })
      .eq("id", true)
      .select()
      .single(),
    admin
      .from("pocketfi_config")
      .update({ virtual_account_enabled: Boolean(pocketfiVirtualAccountEnabled), updated_at: now })
      .eq("id", true)
      .select()
      .single(),
  ]);

  if (daisysms.error || daisysim.error || usOnly.error || pocketfi.error) {
    return NextResponse.json({ error: "Could not save settings" }, { status: 500 });
  }

  return NextResponse.json({
    daisysms: daisysms.data,
    daisysim: daisysim.data,
    usOnly: usOnly.data,
    pocketfi: pocketfi.data,
  });
}
