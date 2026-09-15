import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { parseAndValidateAccountsCsv } from "@/lib/digitalAccountsCsv";

// Lightweight pre-flight the Bulk Account Upload UI calls the moment a file
// is chosen, BEFORE the admin picks (or overrides) a product template — runs
// the exact same parser used at actual upload time
// (app/api/admin/digital-accounts/templates/[id]/upload) purely to read its
// `categoryHint` (see lib/digitalAccountsCsv.js#parseAndValidateAccountsCsv),
// so the template dropdown can pre-select/filter to the matching category
// instead of every upload starting from "choose a template" with no help.
//
// Deliberately advisory only: this never blocks or validates the upload
// itself (a file that fails full validation here can still return a useful
// categoryHint), and the real parse + validation happens again in full at
// upload time against whichever template the admin actually submits to — no
// category is ever hardcoded from this guess, the admin can always pick a
// different template before submitting.
export async function POST(request) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ categoryHint: null });
  }

  const file = formData.get("file");
  if (!file || typeof file.text !== "function") {
    return NextResponse.json({ categoryHint: null });
  }

  const csvText = await file.text();
  const { categoryHint } = parseAndValidateAccountsCsv(csvText);
  return NextResponse.json({ categoryHint: categoryHint || null });
}
