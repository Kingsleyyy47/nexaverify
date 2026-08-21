import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { searchPremiumRecipient, IStarError } from "@/lib/istar";

// Admin-only, deliberately — see istar_config in schema.sql.
export async function GET(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      return NextResponse.json({ error: err.message }, { status: err.status || 502 });
    }
    throw err;
  }
}
