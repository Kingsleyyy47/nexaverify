import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Public (any signed-in customer) — only names/descriptions, nothing
// sensitive. Only returns categories that actually have at least one
// non-archived template, so an empty category an admin is still setting up
// doesn't show up as a dead tab.
export async function GET() {
  const { user } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const [{ data: categories }, { data: templates }] = await Promise.all([
    admin.from("digital_categories").select("id, name, description"),
    admin.from("digital_product_templates").select("category_id").eq("archived", false),
  ]);

  const categoryIdsWithTemplates = new Set((templates || []).map((t) => t.category_id));
  const visible = (categories || []).filter((c) => categoryIdsWithTemplates.has(c.id));

  return NextResponse.json({ categories: visible });
}
