import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestId, action } = await request.json();
  if (!requestId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "requestId and a valid action are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: topupRequest } = await admin
    .from("topup_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (!topupRequest) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (topupRequest.status !== "pending") {
    return NextResponse.json({ error: "This request has already been reviewed" }, { status: 400 });
  }

  if (action === "approve") {
    const { error: chargeError } = await admin.rpc("adjust_balance", {
      p_user_id: topupRequest.user_id,
      p_amount: topupRequest.amount_ngn,
      p_type: "deposit",
      p_reference_id: topupRequest.id,
      p_note: `Wallet top-up approved${topupRequest.note ? ` (${topupRequest.note})` : ""}`,
      p_created_by: profile.id,
    });

    if (chargeError) {
      return NextResponse.json({ error: "Could not credit wallet" }, { status: 500 });
    }
  }

  const { data: updated } = await admin
    .from("topup_requests")
    .update({
      status: action === "approve" ? "approved" : "rejected",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .select()
    .single();

  return NextResponse.json({ request: updated });
}
