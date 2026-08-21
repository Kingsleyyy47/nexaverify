import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { searchStarRecipient, IStarError } from "@/lib/istar";

// Admin-only, deliberately — see istar_config in schema.sql for why this
// whole integration stays admin-gated regardless of the enabled toggle.
export async function GET(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      return NextResponse.json({ error: err.message }, { status: err.status || 502 });
    }
    throw err;
  }
}
