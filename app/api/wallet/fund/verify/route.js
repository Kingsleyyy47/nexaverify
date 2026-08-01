import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { confirmAndCreditPocketfiPayment } from "@/lib/wallet-funding";

// Manual "Check status" retry for a customer's own pending PocketFi
// payment — covers the case where they closed the tab before the checkout
// redirect made it back to /api/wallet/fund/callback. Safe to call
// repeatedly: confirmAndCreditPocketfiPayment only ever credits once.
export async function POST(request) {
  const { user } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { paymentId } = await request.json();
  if (!paymentId) {
    return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
  }

  const result = await confirmAndCreditPocketfiPayment(paymentId, { userId: user.id });

  if (result.outcome === "not_found") {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
