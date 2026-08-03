import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { getServicesForCountry, DaisySimError } from "@/lib/daisysim";

// Admin-only catalog browse for /admin/international's InternationalOverridesManager.
// Deliberately does NOT check daisysim_config.enabled the way the
// customer-facing /api/international/services does — an admin should be able
// to browse and set favorites/blocks even while the feature is switched off,
// to prep the catalog before turning it on.
export async function GET(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const countryId = request.nextUrl.searchParams.get("countryId");
  if (!countryId) return NextResponse.json({ error: "countryId is required" }, { status: 400 });

  try {
    const services = await getServicesForCountry(countryId);
    return NextResponse.json({ services });
  } catch (err) {
    if (err instanceof DaisySimError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }
}
