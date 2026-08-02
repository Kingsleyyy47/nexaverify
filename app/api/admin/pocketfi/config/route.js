import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_BANKS = ["kuda", "safehaven", "paga", "9psb", "palmpay"];

export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { virtualAccountEnabled, virtualAccountBank } = await request.json();

  if (!VALID_BANKS.includes(virtualAccountBank)) {
    return NextResponse.json({ error: "Pick a valid bank" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("pocketfi_config")
    .update({
      virtual_account_enabled: Boolean(virtualAccountEnabled),
      virtual_account_bank: virtualAccountBank,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Could not save settings" }, { status: 500 });

  return NextResponse.json({ config: updated });
}
