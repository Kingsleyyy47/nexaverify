import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { serviceId, enabled } = await request.json();
  if (!serviceId || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "serviceId and enabled are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("services").update({ enabled }).eq("id", serviceId);

  if (error) return NextResponse.json({ error: "Could not update service" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
