import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAndValidateAccountsCsv } from "@/lib/digitalAccountsCsv";

// Bulk-stocks a product template from an uploaded CSV. The WHOLE file is
// rejected — nothing is inserted — if even one row is missing a required
// field, so a typo'd column or one bad row can never silently short the
// upload or leave a partially-stocked batch. See
// lib/digitalAccountsCsv.js#parseAndValidateAccountsCsv for the actual rules.
export async function POST(request, { params }) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: template } = await admin
    .from("digital_product_templates")
    .select("id")
    .eq("id", params.id)
    .maybeSingle();
  if (!template) {
    return NextResponse.json({ error: "Product template not found." }, { status: 404 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file.text !== "function") {
    return NextResponse.json({ error: "Choose a CSV file to upload." }, { status: 400 });
  }

  const csvText = await file.text();
  const { items, errors } = parseAndValidateAccountsCsv(csvText);

  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: `Upload rejected — fix these rows and try again (${errors.length} problem${errors.length === 1 ? "" : "s"}).`,
        rowErrors: errors.slice(0, 50),
      },
      { status: 400 }
    );
  }

  const rows = items.map((item) => ({ ...item, template_id: params.id }));
  const { error: insertError } = await admin.from("digital_stock_items").insert(rows);
  if (insertError) {
    return NextResponse.json({ error: "Could not save the uploaded accounts." }, { status: 500 });
  }

  return NextResponse.json({ inserted: rows.length });
}
