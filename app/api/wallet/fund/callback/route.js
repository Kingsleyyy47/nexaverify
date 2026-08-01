import { NextResponse } from "next/server";
import { getPaymentIdByClientRef, confirmAndCreditPocketfiPayment } from "@/lib/wallet-funding";

// This is the redirect_link we gave PocketFi when starting checkout (see
// app/api/wallet/fund/route.js) — the customer's browser lands here after
// they finish (or abandon) the hosted checkout page. No auth check here on
// purpose: PocketFi is the one redirecting the browser, and the only thing
// this route can act on is the anonymous ?ref= it was given, which is
// already scoped to a single specific payment_transactions row.
export async function GET(request) {
  const clientRef = request.nextUrl.searchParams.get("ref");
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, "");

  if (!clientRef) {
    return NextResponse.redirect(`${siteUrl}/topup?funded=error`);
  }

  const match = await getPaymentIdByClientRef(clientRef);
  if (!match) {
    return NextResponse.redirect(`${siteUrl}/topup?funded=error`);
  }

  try {
    const result = await confirmAndCreditPocketfiPayment(match.paymentId, { userId: match.userId });
    const funded =
      result.outcome === "credited" || result.outcome === "already_processed"
        ? "success"
        : result.outcome === "pending"
        ? "pending"
        : "failed";
    return NextResponse.redirect(`${siteUrl}/topup?funded=${funded}`);
  } catch {
    return NextResponse.redirect(`${siteUrl}/topup?funded=error`);
  }
}
