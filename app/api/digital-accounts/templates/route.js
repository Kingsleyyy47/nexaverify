import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Public (any signed-in customer) catalog for one category — never exposes
// digital_stock_items rows themselves, just a live count of how many are
// still 'available' per template, computed here with the service role key
// (that table has no client-facing select policy at all — see schema.sql).
export async function GET(request) {
  const { user } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const categoryId = request.nextUrl.searchParams.get("categoryId");
  if (!categoryId) {
    return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: templates } = await admin
    .from("digital_product_templates")
    .select("id, name, description, price_ngn, favorite")
    .eq("category_id", categoryId)
    .eq("archived", false)
    .order("created_at", { ascending: true });

  const ids = (templates || []).map((t) => t.id);
  let stockCountByTemplate = {};
  if (ids.length > 0) {
    const { data: stockItems } = await admin
      .from("digital_stock_items")
      .select("template_id")
      .eq("status", "available")
      .in("template_id", ids);
    for (const s of stockItems || []) {
      stockCountByTemplate[s.template_id] = (stockCountByTemplate[s.template_id] || 0) + 1;
    }
  }

  const withStock = (templates || [])
    .map((t) => ({ ...t, availableCount: stockCountByTemplate[t.id] || 0 }))
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));

  return NextResponse.json({ templates: withStock });
}
