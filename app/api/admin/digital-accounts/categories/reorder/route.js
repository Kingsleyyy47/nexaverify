import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Persists a full reorder from the admin Category Shuffle page
// (components/CategoryShuffle.js) — takes the WHOLE list of category ids in
// their new display order and writes each one's array index straight into
// sort_order (0, 1, 2, …), which is exactly what every customer-facing
// categories fetch orders by (see app/api/digital-accounts/categories and
// schema.sql's comment on digital_categories.sort_order). Requires every
// existing category id to be present — a partial list would silently leave
// the missing categories' sort_order unchanged, which could land them
// anywhere relative to the ones that DID move, so this is rejected instead.
export async function POST(request) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orderedIds } = await request.json();
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ error: "orderedIds must be a non-empty array." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin.from("digital_categories").select("id");
  if (fetchError) {
    return NextResponse.json({ error: "Could not load categories." }, { status: 500 });
  }

  const existingIds = new Set((existing || []).map((c) => c.id));
  const providedIds = new Set(orderedIds);
  if (existingIds.size !== providedIds.size || [...existingIds].some((id) => !providedIds.has(id))) {
    return NextResponse.json(
      { error: "This list doesn't match the current categories — refresh and try again." },
      { status: 400 }
    );
  }

  // No bulk "update many rows with different values" in one call via
  // supabase-js, so one update per row — small, admin-only, infrequent
  // action, so a handful of sequential updates is fine.
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin.from("digital_categories").update({ sort_order: i }).eq("id", orderedIds[i]);
    if (error) {
      return NextResponse.json({ error: "Could not save the new order." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
