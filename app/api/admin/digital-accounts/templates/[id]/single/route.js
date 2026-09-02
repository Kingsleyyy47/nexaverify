import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateAccountFields } from "@/lib/digitalAccountsCsv";

// Adds ONE account credential set to an existing product template — the
// "Single Product" admin section (see components/SingleProductForm.js), for
// when an admin wants to stock accounts one at a time instead of building a
// CSV for Bulk Account Upload. Deliberately reuses the exact same
// digital_stock_items table and validateAccountFields() rule as the CSV path
// (lib/digitalAccountsCsv.js) so a single-added account and a CSV-uploaded
// one are indistinguishable to a customer buying it — same required fields
// (password always; email OR username), same optional 2FA/recovery columns.
export async function POST(request, { params }) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: template } = await admin
    .from("digital_product_templates")
    .select("id, archived")
    .eq("id", params.id)
    .maybeSingle();
  if (!template) {
    return NextResponse.json({ error: "Product template not found." }, { status: 404 });
  }
  if (template.archived) {
    return NextResponse.json({ error: "Unarchive this product template before adding stock to it." }, { status: 400 });
  }

  const body = await request.json();
  const trim = (v) => (typeof v === "string" ? v.trim() : "");

  const username = trim(body.username);
  const email = trim(body.email);
  const password = trim(body.password);
  const emailPassword = trim(body.emailPassword);
  const twoFa = trim(body.twoFa);
  const recoveryEmail = trim(body.recoveryEmail);
  const recoveryEmailPassword = trim(body.recoveryEmailPassword);
  const year = trim(body.year);
  const friendsCount = trim(body.friendsCount);

  // Same rule the CSV upload enforces per row — nothing is inserted until
  // both conditions are met, mirrored client-side in SingleProductForm.js so
  // the button is disabled before the admin even submits.
  const fieldError = validateAccountFields({ password, email, username });
  if (fieldError) {
    return NextResponse.json({ error: fieldError }, { status: 400 });
  }

  const { data: item, error } = await admin
    .from("digital_stock_items")
    .insert({
      template_id: params.id,
      username: username || null,
      email: email || null,
      password,
      email_password: emailPassword || null,
      two_fa: twoFa || null,
      recovery_email: recoveryEmail || null,
      recovery_email_password: recoveryEmailPassword || null,
      year: year || null,
      friends_count: friendsCount || null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "Could not save the account." }, { status: 500 });
  }

  return NextResponse.json({ item });
}
