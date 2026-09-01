import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Places a digital-account purchase. All of the actual work — locking the
// template, atomically claiming exactly `quantity` never-sold stock rows
// (rejecting the whole purchase if that many aren't available), recording
// the order, and debiting the wallet — happens inside
// public.purchase_digital_product() in one DB transaction, so there's no
// window where stock could be double-sold or a wallet debited without stock
// actually being claimed. See that function's comment in schema.sql.
export async function POST(request) {
  const { user } = await getSessionProfile();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId, quantity } = await request.json();
  const qty = Number(quantity);
  if (!templateId) {
    return NextResponse.json({ error: "Pick a product" }, { status: 400 });
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    return NextResponse.json({ error: "Enter a valid quantity" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Pre-flight checks purely for a friendlier error message — the RPC itself
  // is the real, race-safe source of truth for both of these and will
  // refuse the purchase either way if something changed in between.
  const { data: template } = await admin
    .from("digital_product_templates")
    .select("id, name, price_ngn, archived")
    .eq("id", templateId)
    .maybeSingle();
  if (!template || template.archived) {
    return NextResponse.json({ error: "This product is no longer available." }, { status: 404 });
  }

  const { data: available } = await admin
    .from("digital_stock_items")
    .select("id")
    .eq("template_id", templateId)
    .eq("status", "available")
    .limit(qty);
  if ((available || []).length < qty) {
    return NextResponse.json({ error: "Not enough stock left for that quantity." }, { status: 409 });
  }

  const total = Math.round(Number(template.price_ngn) * qty * 100) / 100;
  const { data: buyerProfile } = await admin.from("profiles").select("balance").eq("id", user.id).single();
  if (Number(buyerProfile?.balance || 0) < total) {
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 402 });
  }

  const { data: order, error } = await admin.rpc("purchase_digital_product", {
    p_user_id: user.id,
    p_template_id: templateId,
    p_quantity: qty,
  });

  if (error) {
    const message = error.message?.includes("stock")
      ? "Not enough stock left for that quantity."
      : error.message?.includes("Insufficient balance")
        ? "Insufficient wallet balance"
        : error.message || "Could not complete the purchase.";
    const status = message.includes("stock") ? 409 : message.includes("balance") ? 402 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  // Supabase's rpc() for a function returning a single composite row (not
  // setof) hands back that row as `data` directly, not an array — but guard
  // for either shape since this is the one place in the app calling an RPC
  // with this particular return type.
  const orderRow = Array.isArray(order) ? order[0] : order;

  return NextResponse.json({ order: orderRow });
}
