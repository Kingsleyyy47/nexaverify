import { adjustBalance } from "@/lib/wallet-adjustment.mjs";
import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";

export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { requestId, action } = await request.json();
  if (!requestId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "requestId and a valid action are required" }, { status: 400 });
  }
  const admin = createAdminClient();
  const status = action === "approve" ? "approved" : "rejected";
  // Claim before crediting: two admins/double clicks cannot approve the same pending request twice.
  const { data: claimed, error } = await admin.from("topup_requests").update({
    status, reviewed_by: profile.id, reviewed_at: new Date().toISOString(),
  }).eq("id", requestId).eq("status", "pending").select().maybeSingle();
  if (error) return safeErrorResponse(error, { route: "/api/admin/topups/review", userId: user.id });
  if (!claimed) return NextResponse.json({ error: "This request is missing or has already been reviewed" }, { status: 409 });
  if (action === "approve") {
    try {
      await adjustBalance(admin, {
        p_user_id: claimed.user_id, p_amount: claimed.amount_ngn, p_type: "deposit",
        p_reference_id: claimed.id,
        p_note: `Wallet top-up approved${claimed.note ? ` (${claimed.note})` : ""}`,
        p_created_by: profile.id,
      });
    } catch (err) {
      const { error: resetError } = await admin.from("topup_requests")
        .update({ status: "pending", reviewed_by: null, reviewed_at: null })
        .eq("id", claimed.id).eq("status", "approved");
      if (resetError) console.error("[topups/review] Could not release failed approval", resetError);
      return safeErrorResponse(err, { route: "/api/admin/topups/review", userId: user.id, context: { requestId } });
    }
  }
  return NextResponse.json({ request: claimed });
}
