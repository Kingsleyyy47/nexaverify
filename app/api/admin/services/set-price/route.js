import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Sets what NexaVerify actually charges customers for a service, in NGN.
// This is completely independent of DaisySMS's own USD price (last_price) —
// see app/api/rentals/buy/route.js for how the two are used together.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { serviceId, customerPrice } = await request.json();
  const parsedPrice = Number(customerPrice);

  if (!serviceId || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
    return NextResponse.json({ error: "serviceId and a valid customerPrice are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("services")
    .update({ customer_price: parsedPrice })
    .eq("id", serviceId);

  if (error) return NextResponse.json({ error: "Could not update price" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
