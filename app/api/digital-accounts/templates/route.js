import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Public (any signed-in customer) catalog — either one category
// (?categoryId=...) or, when that param is omitted/"all", every category at
// once for the browser's "All" view (see components/DigitalAccountsBrowser.js).
// Never exposes digital_stock_items rows themselves, just a live count of
// how many are still 'available' per template, computed here with the
// service role key (that table has no client-facing select policy at all —
// see schema.sql). Re-checks digital_accounts_config.customer_visible
// itself — see the comment on app/api/digital-accounts/categories/route.js
// for why. Always includes category_id so the "All" view can look up each
// template's own category (logo/name) client-side without a second request
// per product.
export async function GET(request) {
  const { user, profile } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const categoryId = request.nextUrl.searchParams.get("categoryId");
  const wantsAll = !categoryId || categoryId === "all";

  const admin = createAdminClient();

  if (!isAdmin(profile)) {
    const { data: config } = await admin
      .from("digital_accounts_config")
      .select("customer_visible")
      .eq("id", true)
      .maybeSingle();
    if (!config?.customer_visible) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let query = admin
    .from("digital_product_templates")
    .select("id, category_id, name, description, price_ngn, favorite")
    .eq("archived", false)
    .order("created_at", { ascending: true });
  if (!wantsAll) {
    query = query.eq("category_id", categoryId);
  }

  const { data: templates } = await query;

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
