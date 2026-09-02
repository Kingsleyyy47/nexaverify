import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Admin CRUD for public.platform_logos — see the big comment on that table
// in schema.sql. Every buy surface site-wide reads these via the public
// /api/platform-logos route and matches them against service/product names
// with lib/platformLogoMatch.js.
export async function GET() {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: logos } = await admin
    .from("platform_logos")
    .select("*")
    .order("platform_name", { ascending: true });

  return NextResponse.json({ logos: logos || [] });
}

export async function POST(request) {
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
    .insert({ platform_name: name, logo_url: url, logo_url_dark: urlDark || null })
    .select()
    .single();

  if (error) {
    const message =
      error.code === "23505" ? "A logo for that platform name already exists." : "Could not save the logo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ logo: data });
}
