import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Generic admin-only image upload used by every logo form in the app
// (components/ImageUploadField.js) — Platform Logos and Digital Accounts
// Categories both just want "a public URL for this image" and don't care
// whether it came from an upload or was pasted in, so this route doesn't
// need to know which feature it's for either. Stores the file in the public
// "logos" Supabase Storage bucket (see schema.sql) under a random filename
// and hands back its public URL, which the caller then saves into the exact
// same logoUrl/logoUrlDark column a manually-typed URL would have gone into.
const MAX_BYTES = 3 * 1024 * 1024; // 3MB — a logo/icon has no business being bigger than this.
const EXTENSION_BY_TYPE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
};

export async function POST(request) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Choose an image file to upload." }, { status: 400 });
  }

  const ext = EXTENSION_BY_TYPE[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Unsupported image type — use PNG, JPG, WEBP, GIF, or SVG." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large — max 3MB." }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const path = `${randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from("logos").upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ error: "Could not upload the image." }, { status: 500 });
  }

  const { data } = admin.storage.from("logos").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
