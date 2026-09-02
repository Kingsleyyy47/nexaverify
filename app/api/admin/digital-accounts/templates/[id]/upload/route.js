import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAndValidateAccountsCsv } from "@/lib/digitalAccountsCsv";

// Bulk-stocks a product template from an uploaded CSV or TXT file. The WHOLE file is
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
    .select("id, archived")
    .eq("id", params.id)
    .maybeSingle();
  if (!template) {
    return NextResponse.json({ error: "Product template not found." }, { status: 404 });
  }
  if (template.archived) {
    return NextResponse.json({ error: "Unarchive this product template before uploading stock to it." }, { status: 400 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file.text !== "function") {
    return NextResponse.json({ error: "Choose a CSV or TXT file to upload." }, { status: 400 });
  }
  const name = typeof file.name === "string" ? file.name.toLowerCase() : "";
  const type = typeof file.type === "string" ? file.type.toLowerCase() : "";
  const hasName = Boolean(name);
  const hasCsvOrTxtName = name.endsWith(".csv") || name.endsWith(".txt");
  const hasCsvOrTxtType =
    type === "text/csv" ||
    type === "text/plain" ||
    type === "application/csv" ||
    type === "application/vnd.ms-excel";
  const isCsvOrTxt = hasName ? hasCsvOrTxtName : hasCsvOrTxtType;
  if (!isCsvOrTxt) {
    return NextResponse.json({ error: "Choose a CSV or TXT file to upload." }, { status: 400 });
  }

  // The parser (lib/digitalAccountsCsv.js) only cares about the raw text,
  // not whether the filename ends in .csv or .txt, so both upload types share
  // one validation path after this file-type guard.
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
