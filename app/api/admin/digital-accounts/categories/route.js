import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  // Same (sort_order, created_at) ordering the customer-facing categories
  // route uses — see /admin/digital-accounts/category-shuffle — so this
  // list (and CategoryManager's display of it) always shows categories in
  // the exact order customers actually see them in.
  const [{ data: categories }, { data: templates }] = await Promise.all([
    admin
      .from("digital_categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    admin.from("digital_product_templates").select("id, category_id"),
  ]);

  const countByCategory = {};
  for (const t of templates || []) {
    countByCategory[t.category_id] = (countByCategory[t.category_id] || 0) + 1;
  }

  const withCounts = (categories || []).map((c) => ({
    ...c,
    templateCount: countByCategory[c.id] || 0,
  }));

  return NextResponse.json({ categories: withCounts });
}

export async function POST(request) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, description, logoUrl, logoUrlDark } = await request.json();
  const trimmed = (name || "").trim();
  if (!trimmed) {
    return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("digital_categories")
    .insert({
      name: trimmed,
      description: description?.trim() || null,
      logo_url: logoUrl?.trim() || null,
      logo_url_dark: logoUrlDark?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    const message = error.code === "23505" ? "A category with that name already exists." : "Could not create category.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ category: data });
}
