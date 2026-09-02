import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request, { params }) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { platformName, logoUrl, logoUrlDark } = await request.json();
  const name = (platformName || "").trim();
  const url = (logoUrl || "").trim();
  const urlDark = (logoUrlDark || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Platform name is required" }, { status: 400 });
  }
  if (!url) {
    return NextResponse.json({ error: "Logo URL is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_logos")
    .update({
      platform_name: name,
      logo_url: url,
      logo_url_dark: urlDark || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    const message =
      error.code === "23505" ? "A logo for that platform name already exists." : "Could not save changes.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ logo: data });
}

export async function DELETE(_request, { params }) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("platform_logos").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: "Could not delete the logo." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
