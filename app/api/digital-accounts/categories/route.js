import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Public (any signed-in customer) — only names/descriptions, nothing
// sensitive. Only returns categories that actually have at least one
// non-archived template, so an empty category an admin is still setting up
// doesn't show up as a dead tab. Re-checks digital_accounts_config.
// customer_visible itself (same as app/(customer)/digital-accounts/page.js)
// rather than trusting that page's own gate, so this can't be reached
// directly while the feature is still "Coming soon" for non-admins.
export async function GET() {
  const { user, profile } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const [{ data: categories }, { data: templates }] = await Promise.all([
    admin.from("digital_categories").select("id, name, description, logo_url"),
    admin.from("digital_product_templates").select("category_id").eq("archived", false),
  ]);

  const categoryIdsWithTemplates = new Set((templates || []).map((t) => t.category_id));
  // logoUrl (camelCase) is what DigitalAccountsBrowser.js reads — mapped here
  // rather than exposing the raw column name to the client response.
  const visible = (categories || [])
    .filter((c) => categoryIdsWithTemplates.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, description: c.description, logoUrl: c.logo_url }));

  return NextResponse.json({ categories: visible });
}
