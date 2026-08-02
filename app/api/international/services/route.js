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
    return NextResponse.json({ services });
  } catch (err) {
    if (err instanceof DaisySimError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }
}
