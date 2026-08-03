import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { getServicesForCountry, DaisySimError } from "@/lib/daisysim";
import { createAdminClient } from "@/lib/supabase/admin";

// Lists services available for a country, for the "International numbers"
// buy flow (see components/InternationalBuyForm.js). Live pass-through to
// DaisySim — there's no local catalog to query, unlike the DaisySMS
// services table.
export async function GET(request) {
  const { user } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: config } = await admin.from("daisysim_config").select("enabled").eq("id", true).maybeSingle();
  if (!config?.enabled) {
    return NextResponse.json({ error: "International numbers aren't available right now" }, { status: 403 });
  }

  const countryId = request.nextUrl.searchParams.get("countryId");
  if (!countryId) return NextResponse.json({ error: "countryId is required" }, { status: 400 });

  try {
    const services = await getServicesForCountry(countryId);

    // Admin-set favorites/blocks for this country (see /admin/international
    // -> InternationalOverridesManager, public.daisysim_overrides) —
    // favorited services sort to the top, disabled ones are hidden entirely,
    // mirroring the DaisySMS Products favorite/enable pattern.
    const { data: overrides } = await admin
      .from("daisysim_overrides")
      .select("service_code, favorite, disabled")
      .eq("country_id", countryId);

    const overrideMap = new Map((overrides || []).map((o) => [o.service_code, o]));

    const visible = services.filter((s) => !overrideMap.get(s.code)?.disabled);
    visible.sort((a, b) => {
      const aFav = overrideMap.get(a.code)?.favorite ? 1 : 0;
      const bFav = overrideMap.get(b.code)?.favorite ? 1 : 0;
      return bFav - aFav;
    });

    return NextResponse.json({ services: visible });
  } catch (err) {
    if (err instanceof DaisySimError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }
}
