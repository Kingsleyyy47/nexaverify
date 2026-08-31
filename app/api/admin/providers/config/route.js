import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Single route for the /admin/providers overview page's master switches.
// Each one writes to the SAME config table/column its own dedicated settings
// page already uses (public.daisysms_config.enabled,
// public.daisysim_config.enabled, public.daisysim_usa_config.enabled,
// public.pocketfi_config.virtual_account_enabled, public.istar_config.enabled,
// public.social_boost_config.enabled) — this is just a second, faster place
// to flip them, not a separate source of truth. /admin/international,
// /admin/us-only, /admin/pocketfi, /admin/telegram-premium, and
// /admin/social-boost still work exactly as before for the detailed settings
// (markup, bank, price, balance). Note istarEnabled and socialBoostEnabled do
// NOT control customer visibility the way the other four do — see each
// provider's own _config table in schema.sql.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const {
    daisysmsEnabled,
    daisysimEnabled,
    usOnlyEnabled,
    pocketfiVirtualAccountEnabled,
    istarEnabled,
    socialBoostEnabled,
  } = await request.json();

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const [daisysms, daisysim, usOnly, pocketfi, istar, socialBoost] = await Promise.all([
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
    admin
      .from("istar_config")
      .update({ enabled: Boolean(istarEnabled), updated_at: now })
      .eq("id", true)
      .select()
      .single(),
    admin
      .from("social_boost_config")
      .update({ enabled: Boolean(socialBoostEnabled), updated_at: now })
      .eq("id", true)
      .select()
      .single(),
  ]);

  if (daisysms.error || daisysim.error || usOnly.error || pocketfi.error || istar.error || socialBoost.error) {
    return NextResponse.json({ error: "Could not save settings" }, { status: 500 });
  }

  return NextResponse.json({
    daisysms: daisysms.data,
    daisysim: daisysim.data,
    usOnly: usOnly.data,
    pocketfi: pocketfi.data,
    istar: istar.data,
    socialBoost: socialBoost.data,
  });
}
