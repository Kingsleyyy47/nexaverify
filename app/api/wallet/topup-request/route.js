import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Customer asks for funds to be added — this does NOT touch their balance.
// It just files a request an admin reviews at /admin/topups. Approving it
// is the only thing that actually calls adjust_balance().
export async function POST(request) {
  const { user } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { amount, note } = await request.json();
  const parsedAmount = Number(amount);

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("topup_requests")
    .insert({
      user_id: user.id,
      amount_ngn: parsedAmount,
      note: note || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Could not submit request" }, { status: 500 });
  }

  return NextResponse.json({ request: data });
}
