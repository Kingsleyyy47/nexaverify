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
    // Database-side GROUP BY/COUNT (see digital_stock_available_counts() in
    // schema.sql) instead of pulling every matching digital_stock_items row
    // into JS and counting it here — that approach silently truncated at
    // Supabase's default 1000-row PostgREST response cap once a large bulk
    // upload pushed total available stock past it, making some templates'
    // "N pcs" count read as 0 even though the stock was really there.
    //
    // Called with NO p_template_ids filter (same as the admin route) rather
    // than passing this request's `ids` array through to Postgres — the
    // filtered-array call was itself coming back empty for some templates
    // for customers even after the count function was in place, while the
    // unfiltered call (admin's) was correct. Filtering to just the ids we
    // need happens here in JS instead, against the one proven-correct call.
    const { data: counts } = await admin.rpc("digital_stock_available_counts");
    const idSet = new Set(ids);
    for (const c of counts || []) {
      if (idSet.has(c.template_id)) {
        stockCountByTemplate[c.template_id] = Number(c.available_count);
      }
    }
  }

  const withStock = (templates || [])
    .map((t) => ({ ...t, availableCount: stockCountByTemplate[t.id] || 0 }))
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));

  return NextResponse.json({ templates: withStock });
}
