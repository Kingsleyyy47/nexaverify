import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrderStatus, SocialBoostError } from "@/lib/socialboost";

// This panel is poll-only — no webhook — so a status refresh is always a
// manual (or eventually scheduled) pull, unlike DaisySMS/iStar which push.
export async function POST(_request, { params }) {
  const { user, profile } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data: order } = await admin.from("social_boost_orders").select("*").eq("id", params.id).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!isAdmin(profile) && order.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const status = await getOrderStatus(order.provider_order_id);
    const { data: updated, error } = await admin
      .from("social_boost_orders")
      .update({
        status: status.status || order.status,
        remains: status.remains != null ? Number(status.remains) : order.remains,
        start_count: status.start_count != null ? Number(status.start_count) : order.start_count,
        charge: status.charge != null ? Number(status.charge) : order.charge,
        currency: status.currency || order.currency,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: "Could not save refreshed status" }, { status: 500 });
    return NextResponse.json({ order: updated });
  } catch (err) {
    if (err instanceof SocialBoostError) {
      return NextResponse.json({ error: err.message }, { status: err.status || 502 });
    }
    throw err;
  }
}
