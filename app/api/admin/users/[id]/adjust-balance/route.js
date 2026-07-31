import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request, { params }) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { amount, note } = await request.json();
  const parsedAmount = Number(amount);

  if (!Number.isFinite(parsedAmount) || parsedAmount === 0) {
    return NextResponse.json({ error: "amount must be a non-zero number" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: newBalance, error } = await admin.rpc("adjust_balance", {
    p_user_id: params.id,
    p_amount: parsedAmount,
    p_type: "admin_adjustment",
    p_reference_id: null,
    p_note: note || null,
    p_created_by: profile.id,
  });

  if (error) {
    const message = error.message.includes("Insufficient balance")
      ? "That adjustment would put the user's balance below zero."
      : "Could not apply adjustment";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ balance: newBalance });
}
