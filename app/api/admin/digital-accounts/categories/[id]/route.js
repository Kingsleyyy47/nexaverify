import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request, { params }) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, description } = await request.json();
  const trimmed = (name || "").trim();
  if (!trimmed) {
    return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("digital_categories")
    .update({ name: trimmed, description: description?.trim() || null })
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    const message = error.code === "23505" ? "A category with that name already exists." : "Could not update category.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ category: data });
}

// Cascades to that category's templates and (via template deletion) their
// stock — see the on delete cascade chain in schema.sql. Past orders survive
// this (template_id set null, template_name/category_name already
// denormalized), so a customer's Order Details page keeps working.
export async function DELETE(_request, { params }) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("digital_categories").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: "Could not delete category." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
