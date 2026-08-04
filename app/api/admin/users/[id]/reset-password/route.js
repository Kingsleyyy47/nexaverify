import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Lets an admin set a user's password directly — for support cases where the
// customer can't get to their email for the self-service /forgot-password
// flow. Straight service-role auth admin call, no email/token involved, so
// the new password is live immediately.
export async function POST(request, { params }) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { password } = await request.json();
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(params.id, { password });

  if (error) {
    return NextResponse.json({ error: "Could not reset password" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
