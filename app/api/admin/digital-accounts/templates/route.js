import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const [{ data: templates }, { data: categories }, { data: stockItems }] = await Promise.all([
    admin.from("digital_product_templates").select("*").order("created_at", { ascending: false }),
    admin.from("digital_categories").select("id, name"),
    admin.from("digital_stock_items").select("template_id, status"),
  ]);

  const categoryById = {};
  for (const c of categories || []) categoryById[c.id] = c.name;

  const stockCountByTemplate = {};
  for (const s of stockItems || []) {
    if (s.status !== "available") continue;
    stockCountByTemplate[s.template_id] = (stockCountByTemplate[s.template_id] || 0) + 1;
  }

  const withExtras = (templates || []).map((t) => ({
    ...t,
    categoryName: categoryById[t.category_id] || "Uncategorized",
    stockCount: stockCountByTemplate[t.id] || 0,
  }));

  return NextResponse.json({ templates: withExtras });
}

export async function POST(request) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { categoryId, name, priceNgn, description } = await request.json();
  const trimmedName = (name || "").trim();
  const price = Number(priceNgn);

  if (!categoryId) {
    return NextResponse.json({ error: "Select a category" }, { status: 400 });
  }
  if (!trimmedName) {
    return NextResponse.json({ error: "Product name is required" }, { status: 400 });
  }
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "Enter a valid price" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("digital_product_templates")
    .insert({
      category_id: categoryId,
      name: trimmedName,
      price_ngn: price,
      description: description?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Could not create product template." }, { status: 400 });
  }

  return NextResponse.json({ template: data });
}
