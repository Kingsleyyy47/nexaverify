import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Per-product favorite/star toggle — favorited products get pinned in a
// collapsible section at the top of /admin/products.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { serviceId, favorite } = await request.json();
  if (!serviceId || typeof favorite !== "boolean") {
    return NextResponse.json({ error: "serviceId and favorite are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("services").update({ favorite }).eq("id", serviceId);

  if (error) return NextResponse.json({ error: "Could not update service" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
