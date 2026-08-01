import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createVirtualAccount, PocketfiError } from "@/lib/pocketfi";

// Bank provider for new virtual accounts. kuda/saveheaven/paga/9psb all work
// without NIN/BVN; palmpay requires both, which NexaVerify doesn't collect —
// Kingsley picked kuda.
const VIRTUAL_ACCOUNT_BANK = process.env.POCKETFI_VIRTUAL_ACCOUNT_BANK || "kuda";

// Get-or-create: returns the customer's existing dedicated account if one's
// already on file, otherwise asks PocketFi for a new one and stores it.
// POST (not GET) since creating a real bank account is a side effect, even
// though this is idempotent per customer (unique constraint on user_id).
export async function POST() {
  const { user, profile } = await getSessionProfile();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!user.email) {
    return NextResponse.json({ error: "Your account has no email on file" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("virtual_accounts")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "pocketfi")
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ account: existing });
  }

  // Same placeholder approach as /api/wallet/fund — Kingsley's explicit call
  // to keep using these rather than collect real name/phone, accepting the
  // (small, since kuda/etc. don't require NIN/BVN) risk that a bank
  // occasionally rejects clearly-fake data on a real NUBAN account.
  const firstName = profile?.username || "NexaVerify";
  const lastName = "Customer";
  const phone = "08000000000";

  let created;
  try {
    created = await createVirtualAccount({
      firstName,
      lastName,
      phone,
      email: user.email,
      bank: VIRTUAL_ACCOUNT_BANK,
    });
  } catch (err) {
    if (err instanceof PocketfiError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }

  const { data: inserted, error: insertError } = await admin
    .from("virtual_accounts")
    .insert({
      user_id: user.id,
      provider: "pocketfi",
      bank: created.bankName,
      account_number: created.accountNumber,
      account_name: created.accountName,
    })
    .select()
    .maybeSingle();

  if (insertError) {
    // Rare race: two requests both found no existing row and both called
    // PocketFi. The unique constraint on user_id stops the second INSERT —
    // fall back to whatever row actually won instead of erroring.
    const { data: winner } = await admin
      .from("virtual_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "pocketfi")
      .maybeSingle();
    if (winner) return NextResponse.json({ account: winner });
    return NextResponse.json({ error: "Could not save the new account" }, { status: 500 });
  }

  return NextResponse.json({ account: inserted });
}
