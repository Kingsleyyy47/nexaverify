import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServices, SocialBoostError } from "@/lib/socialboost";
import { detectPlatform } from "@/lib/socialboost-platform";

// Admins can always reach this (their own testing flow, AND the catalog
// manager at /admin/social-boost); everyone else additionally needs
// social_boost_config.customer_visible — same two-switch gate as
// app/api/social-boost/orders. Proxies the panel's live service catalog —
// could be hundreds/thousands of rows, so this is fetched on demand by the
// client rather than on every page load.
//
// Every service is merged with its local override row (favorite/enabled/
// markup_ngn — see public.social_boost_overrides) and tagged with a
// `platform` (Instagram/TikTok/Facebook/Twitter/Other — see
// lib/socialboost-platform.js) for the customer buy form's tab bar. Admins
// see EVERY service including ones an admin has disabled (so the catalog
// manager can re-enable them); non-admins only ever see enabled ones.
//
// force-dynamic + the explicit no-store header below exist because this is
// the one catalog in the app fetched client-side by URL (every other
// catalog — Products, US Only, International — comes down as server-rendered
// props instead), which makes it the one route a mobile browser's own HTTP
// cache can serve stale: after "Disable all"/"Enable all" on
// /admin/social-boost, SocialBoostCatalogManager re-fetches this same exact
// URL to refresh the list, and without these two hints some mobile browsers
// (Safari in particular) will happily hand back their last cached response
// instead of re-hitting the server — which looks exactly like the bulk
// action silently not having worked, even though it did.
export const dynamic = "force-dynamic";

export async function GET() {
  const { user, profile } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const isAdminCaller = isAdmin(profile);

  const admin = createAdminClient();
  const { data: config } = await admin.from("social_boost_config").select("*").eq("id", true).maybeSingle();
  // Admins can always browse/manage the catalog (e.g. to set up markups at
  // /admin/social-boost) even before flipping "Enabled" on — mirrors
  // /admin/us-only's own catalog browser, which isn't gated on its provider
  // being enabled either. Non-admins need both switches.
  if (!isAdminCaller) {
    if (!config?.enabled) {
      return NextResponse.json({ error: "Social Boost isn't enabled yet — turn it on in admin settings first." }, { status: 403 });
    }
    if (!config.customer_visible) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const [services, { data: overrides }] = await Promise.all([
      getServices(),
      admin.from("social_boost_overrides").select("*"),
    ]);

    const overrideMap = new Map((overrides || []).map((o) => [o.service_id, o]));

    let merged = (Array.isArray(services) ? services : []).map((s) => {
      const o = overrideMap.get(Number(s.service));
      return {
        ...s,
        platform: detectPlatform(s),
        enabled: o?.enabled ?? true,
        favorite: Boolean(o?.favorite),
        // markupNgn stays the FLAT number (0 when this service is actually in
        // percent mode — see schema.sql's comment on
        // social_boost_overrides.markup_type — so the admin row's flat ₦
        // input never shows a stale/misleading number). markupType/
        // markupPercent are passed through raw so both the catalog manager
        // row and the customer buy form's live preview (SocialBoostBuyForm)
        // can branch on them the same way app/api/social-boost/orders does
        // at actual purchase time.
        markupType: o?.markup_type === "percent" ? "percent" : "flat",
        markupPercent: Number(o?.markup_percent || 0),
        markupNgn: o?.markup_type === "percent" ? 0 : Number(o?.markup_ngn || 0),
      };
    });

    if (!isAdminCaller) {
      merged = merged.filter((s) => s.enabled);
    }

    return NextResponse.json({ services: merged }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SocialBoostError) {
      return NextResponse.json({ error: err.message }, { status: err.status || 502 });
    }
    throw err;
  }
}
