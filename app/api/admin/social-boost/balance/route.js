import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { getBalance, SocialBoostError } from "@/lib/socialboost";

export async function GET() {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const balance = await getBalance();
    return NextResponse.json({ balance });
  } catch (err) {
    if (err instanceof SocialBoostError) {
      return NextResponse.json({ error: err.message }, { status: err.status || 502 });
    }
    throw err;
  }
}
