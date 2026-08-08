import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStatus, DaisyError } from "@/lib/daisy";
import { checkSms, DaisySimError } from "@/lib/daisysim";
import { checkSms as checkSmsUsa, DaisySimUsaError } from "@/lib/daisysimUsa";

export async function GET(request) {
  const { user, supabase } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // RLS scopes this to rentals owned by the caller — returns null otherwise.
  const { data: rental } = await supabase.from("rentals").select("*").eq("id", id).single();
  if (!rental) return NextResponse.json({ error: "Rental not found" }, { status: 404 });

  if (rental.status !== "waiting") {
    return NextResponse.json({ rental });
  }

  const admin = createAdminClient();

  if (rental.provider === "daisysim") {
    try {
      const result = await checkSms(rental.daisysim_activation_id);

      if (result.status === "received") {
        const { data: updated } = await admin
          .from("rentals")
          .update({ status: "received", sms_code: result.code, updated_at: new Date().toISOString() })
          .eq("id", rental.id)
          .select()
          .single();

        await admin.from("sms_messages").insert({ rental_id: rental.id, code: result.code, text: result.code });

        return NextResponse.json({ rental: updated });
      }

      if (result.status === "cancelled") {
        const { data: updated } = await admin
          .from("rentals")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", rental.id)
          .select()
          .single();
        return NextResponse.json({ rental: updated });
      }

      return NextResponse.json({ rental }); // still waiting
    } catch (err) {
      if (err instanceof DaisySimError && err.code === "NOT_FOUND") {
        return NextResponse.json({ rental }); // transient — just report current state
      }
      return NextResponse.json({ error: "Could not check status right now" }, { status: 502 });
    }
  }

  if (rental.provider === "daisysim_usa") {
    try {
      const result = await checkSmsUsa(rental.daisysim_usa_activation_id);

      if (result.status === "received") {
        const { data: updated } = await admin
          .from("rentals")
          .update({ status: "received", sms_code: result.code, updated_at: new Date().toISOString() })
          .eq("id", rental.id)
          .select()
          .single();

        await admin.from("sms_messages").insert({ rental_id: rental.id, code: result.code, text: result.code });

        return NextResponse.json({ rental: updated });
      }

      if (result.status === "cancelled") {
        const { data: updated } = await admin
          .from("rentals")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", rental.id)
          .select()
          .single();
        return NextResponse.json({ rental: updated });
      }

      return NextResponse.json({ rental }); // still waiting
    } catch (err) {
      if (err instanceof DaisySimUsaError && err.code === "NOT_FOUND") {
        return NextResponse.json({ rental }); // transient — just report current state
      }
      return NextResponse.json({ error: "Could not check status right now" }, { status: 502 });
    }
  }

  try {
    const result = await getStatus(rental.daisy_id, { wantFullText: true });

    if (result.status === "received") {
      const { data: updated } = await admin
        .from("rentals")
        .update({ status: "received", sms_code: result.code, full_text: result.fullText, updated_at: new Date().toISOString() })
        .eq("id", rental.id)
        .select()
        .single();

      await admin.from("sms_messages").insert({
        rental_id: rental.id,
        code: result.code,
        text: result.fullText,
      });

      return NextResponse.json({ rental: updated });
    }

    if (result.status === "cancelled") {
      const { data: updated } = await admin
        .from("rentals")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", rental.id)
        .select()
        .single();
      return NextResponse.json({ rental: updated });
    }

    // still waiting
    return NextResponse.json({ rental });
  } catch (err) {
    if (err instanceof DaisyError && err.code === "NO_ACTIVATION") {
      return NextResponse.json({ rental }); // transient — just report current state
    }
    return NextResponse.json({ error: "Could not check status right now" }, { status: 502 });
  }
}
