import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchPremiumRecipient, IStarError } from "@/lib/istar";

// Admins can always reach this (their own testing flow). Everyone else only
// if istar_config.customer_visible is on — see that column's comment in
// schema.sql for why this is a separate flag from `enabled`.
export async function GET(request) {
  const { user, profile } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const admin_ = isAdmin(profile);
  if (!admin_) {
    const admin = createAdminClient();
    const { data: config } = await admin.from("istar_config").select("customer_visible").eq("id", true).maybeSingle();
    if (!config?.customer_visible) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const username = request.nextUrl.searchParams.get("username");
  const months = request.nextUrl.searchParams.get("months");
  if (!username || !months) {
    return NextResponse.json({ error: "username and months are required" }, { status: 400 });
  }

  try {
    const result = await searchPremiumRecipient({ username, months: Number(months) });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof IStarError) {
      // HTTP status + code included for admins only — needed to tell apart
      // "iStar rejected this specific recipient" (4xx, e.g. already has
      // Premium or a privacy setting blocks gifting) from "something's wrong
      // with our request" vs a provider-side outage (5xx), especially since
      // this same username can succeed on the star-gifting side.
      return NextResponse.json(
        {
          error: admin_
            ? `${err.message} (HTTP ${err.status || "?"}, code ${err.code || "?"})`
            : "Could not look up that username — try again shortly.",
        },
        { status: err.status || 502 }
      );
    }
    throw err;
  }
}
