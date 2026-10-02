import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStatus, DaisyError } from "@/lib/daisy";
import { checkSms, DaisySimError } from "@/lib/daisysim";
import { checkSms as checkSmsUsa, GetatextError } from "@/lib/getatext";
import { checkStatus as checkStatusUsa, DaisySimUsaError } from "@/lib/daisysimUsa";
import { safeErrorResponse } from "@/lib/apiError";
import { logError } from "@/lib/errorLog";

export async function GET(request) {
  const { user } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const admin = createAdminClient();
  const lookup = () => admin.from("rentals").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  const { data: rental, error } = await lookup();
  if (error) return safeErrorResponse(error, { route: "/api/rentals/status", userId: user.id });
  if (!rental) return NextResponse.json({ error: "Rental not found" }, { status: 404 });
  if (rental.status !== "waiting") return NextResponse.json({ rental });
  let result;
  try {
    if (rental.provider === "daisysim") result = await checkSms(rental.daisysim_activation_id);
    else if (rental.provider === "daisysim_usa") result = rental.us_only_backend === "daisysim"
      ? await checkStatusUsa(rental.daisysim_server7_activation_id)
      : await checkSmsUsa(rental.daisysim_usa_activation_id);
    else result = await getStatus(rental.daisy_id, { wantFullText: true });
  } catch (err) {
    if ((err instanceof DaisyError && err.code === "NO_ACTIVATION") ||
        (err instanceof DaisySimError && err.code === "NOT_FOUND") ||
        (err instanceof GetatextError && err.code === "NOT_FOUND") ||
        (err instanceof DaisySimUsaError && ["NOT_FOUND", "USER_NOT_FOUND"].includes(err.code))) {
      return NextResponse.json({ rental });
    }
    return NextResponse.json({ error: "Could not check status right now" }, { status: 502 });
  }
  if (!["received", "cancelled"].includes(result.status)) return NextResponse.json({ rental });
  const patch = { status: result.status, updated_at: new Date().toISOString() };
  if (result.status === "received") { patch.sms_code = result.code; patch.full_text = result.fullText || null; }
  // Only one poll can resolve a waiting rental; a late poll cannot revive a cancelled/refunded one.
  const { data: updated, error: updateError } = await admin.from("rentals").update(patch)
    .eq("id", id).eq("user_id", user.id).eq("status", "waiting").select().maybeSingle();
  if (updateError) return safeErrorResponse(updateError, { route: "/api/rentals/status", userId: user.id });
  if (!updated) {
    const { data: current, error: currentError } = await lookup();
    if (currentError) return safeErrorResponse(currentError, { route: "/api/rentals/status", userId: user.id });
    return NextResponse.json({ rental: current });
  }
  if (result.status === "received") {
    const { error: smsError } = await admin.from("sms_messages").insert({ rental_id: id, code: result.code, text: result.fullText || result.code });
    if (smsError) await logError({ error: smsError, route: "/api/rentals/status", userId: user.id, context: { rentalId: id, stage: "save-sms-history" } });
  }
  return NextResponse.json({ rental: updated });
}
