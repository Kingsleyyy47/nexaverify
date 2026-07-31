import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Bulk-adjusts customer_price (NGN — what customers actually pay, set by
// admins on this page) for a set of services by a flat amount. Used by the
// "Markup" control on /admin/products, scoped to whatever's currently
// visible (respects the search filter), same as "Enable all". A positive
// amount raises every matching product's price by that much; a negative
// amount lowers it. Result is floored at 0 so a price can never go negative.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { serviceIds, amount } = await request.json();
  const amt = Number(amount);

  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    return NextResponse.json({ error: "serviceIds must be a non-empty array" }, { status: 400 });
  }
  if (!Number.isFinite(amt) || amt === 0) {
    return NextResponse.json({ error: "Enter a non-zero amount" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: rows, error: fetchError } = await admin
    .from("services")
    .select("id, name, customer_price")
    .in("id", serviceIds);

  if (fetchError) {
    return NextResponse.json({ error: "Could not load services" }, { status: 500 });
  }

  // Applies to every matching service, whether it already has a price or
  // not — a service with no price yet is treated as starting from ₦0, so
  // this also works as a way to bulk-set a first price for never-priced
  // products (e.g. right after "Enable all"), not just bump existing ones.
  const updates = (rows || []).map((r) => ({
    id: r.id,
    // NOT NULL with no default — must be carried through on every row or
    // Postgres rejects the whole upsert (see services/sync/route.js for
    // the same gotcha explained in more detail).
    name: r.name,
    customer_price: Math.max(0, Number(r.customer_price || 0) + amt),
  }));

  if (updates.length > 0) {
    const { error } = await admin.from("services").upsert(updates, { onConflict: "id" });
    if (error) {
      return NextResponse.json({ error: "Could not update prices" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, updated: updates.length });
}
