import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request, { params }) {
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
    .update({
      name: trimmed,
      description: description?.trim() || null,
      logo_url: logoUrl?.trim() || null,
      logo_url_dark: logoUrlDark?.trim() || null,
    })
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    const message = error.code === "23505" ? "A category with that name already exists." : "Could not update category.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ category: data });
}

// Cascades to that category's templates and their unsold stock. If any sold
// credentials exist under the category, reject hard deletion so customers'
// past Order Details pages can still show the credentials they bought.
export async function DELETE(_request, { params }) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: templates, error: templateLookupError } = await admin
    .from("digital_product_templates")
    .select("id")
    .eq("category_id", params.id);
  if (templateLookupError) {
    return NextResponse.json({ error: "Could not delete category." }, { status: 400 });
  }

  const templateIds = (templates || []).map((t) => t.id);
  if (templateIds.length > 0) {
    const { data: soldItems, error: soldLookupError } = await admin
      .from("digital_stock_items")
      .select("id")
      .in("template_id", templateIds)
      .eq("status", "sold")
      .limit(1);
    if (soldLookupError) {
      return NextResponse.json({ error: "Could not delete category." }, { status: 400 });
    }
    if ((soldItems || []).length > 0) {
      return NextResponse.json(
        { error: "This category has sold accounts. Archive its templates instead so past order credentials stay available." },
        { status: 409 }
      );
    }
  }

  const { error } = await admin.from("digital_categories").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: "Could not delete category." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
