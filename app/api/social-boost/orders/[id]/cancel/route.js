import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelOrders, SocialBoostError } from "@/lib/socialboost";

// Not every service supports cancellation (see the `cancel` boolean on each
// service in /services) — the panel just returns an error for that order id
// if it doesn't, which is surfaced as-is rather than guessed at up front.
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
    const results = await cancelOrders([order.provider_order_id]);
    const result = Array.isArray(results) ? results[0] : null;
    const cancelResult = result?.cancel;

    if (cancelResult && typeof cancelResult === "object" && cancelResult.error) {
      return NextResponse.json({ error: cancelResult.error }, { status: 400 });
    }

    const { data: updated, error } = await admin
      .from("social_boost_orders")
      .update({ cancel_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: "Could not save cancel request" }, { status: 500 });
    return NextResponse.json({ order: updated });
  } catch (err) {
    if (err instanceof SocialBoostError) {
      return NextResponse.json({ error: err.message }, { status: err.status || 502 });
    }
    throw err;
  }
}
