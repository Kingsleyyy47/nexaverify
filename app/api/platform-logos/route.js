import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Public (any signed-in user) read of every platform logo an admin has set
// up — see the big comment on public.platform_logos in schema.sql. This is
// the one endpoint every buy surface (BuyForm, QuickBuyList, UsOnlyBuyList,
// InternationalBuyForm, SocialBoostBuyForm) fetches from, via
// components/usePlatformLogos.js, then matches locally with
// lib/platformLogoMatch.js — nothing here is scoped to one provider, so
// adding a brand new provider later needs zero changes to this route.
export async function GET() {
  const { user } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: logos } = await admin.from("platform_logos").select("platform_name, logo_url, logo_url_dark");

  return NextResponse.json({
    logos: (logos || []).map((l) => ({
      platformName: l.platform_name,
      logoUrl: l.logo_url,
      logoUrlDark: l.logo_url_dark,
    })),
  });
}
