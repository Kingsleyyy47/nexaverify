import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  // Database-side GROUP BY/COUNT (digital_stock_available_counts() in
  // schema.sql) instead of pulling every digital_stock_items row (of every
  // status, for every template — no filter or scoping at all, the worst
  // case of this bug) into JS and counting it here. That approach silently
  // truncated at Supabase's default 1000-row PostgREST response cap once a
  // large bulk upload pushed total stock rows past it, so some templates
  // showed "0 pcs / Sold out" here in admin even though they had real stock.
  const [{ data: templates }, { data: categories }, { data: counts }] = await Promise.all([
    admin.from("digital_product_templates").select("*").order("created_at", { ascending: false }),
    admin.from("digital_categories").select("id, name"),
    admin.rpc("digital_stock_available_counts"),
  ]);

  const categoryById = {};
  for (const c of categories || []) categoryById[c.id] = c.name;

  const stockCountByTemplate = {};
  for (const c of counts || []) {
    stockCountByTemplate[c.template_id] = Number(c.available_count);
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
