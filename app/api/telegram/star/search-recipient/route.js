import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchStarRecipient, IStarError } from "@/lib/istar";

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
  const quantity = request.nextUrl.searchParams.get("quantity");
  if (!username || !quantity) {
    return NextResponse.json({ error: "username and quantity are required" }, { status: 400 });
  }

  try {
    const result = await searchStarRecipient({ username, quantity: Number(quantity) });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof IStarError) {
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
