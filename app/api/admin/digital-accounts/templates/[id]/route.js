import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Accepts whichever fields the caller sends and updates only those — the
// catalog manager UI always sends the full current row (name/price/
// description/favorite/archived/categoryId) even when the user only clicked
// one button (e.g. "Favorite"), same reasoning as every other per-row
// override save in this app (SocialBoostServiceRow, etc.): Supabase's
// .update() only touches the columns you pass, so a partial body from a
// future caller wouldn't accidentally clobber the rest either way, but
// sending the full state keeps the client's local optimistic state and the
// server in sync.
export async function PATCH(request, { params }) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const update = {};

  if (body.name !== undefined) {
    const trimmed = (body.name || "").trim();
    if (!trimmed) return NextResponse.json({ error: "Product name is required" }, { status: 400 });
    update.name = trimmed;
  }
  if (body.priceNgn !== undefined) {
    const price = Number(body.priceNgn);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "Enter a valid price" }, { status: 400 });
    }
    update.price_ngn = price;
  }
  if (body.description !== undefined) {
    update.description = body.description?.trim() || null;
  }
  if (body.categoryId !== undefined) {
    update.category_id = body.categoryId;
  }
  if (body.favorite !== undefined) {
    update.favorite = Boolean(body.favorite);
  }
  if (body.archived !== undefined) {
    update.archived = Boolean(body.archived);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("digital_product_templates")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Could not save changes." }, { status: 400 });
  }

  return NextResponse.json({ template: data });
}

// Cascades its unsold stock (see schema.sql). If any sold credential rows
// exist, reject hard deletion so customers' past Order Details pages can
// still show the credentials they bought; use Archive to take it off sale.
export async function DELETE(_request, { params }) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: soldItems, error: soldLookupError } = await admin
    .from("digital_stock_items")
    .select("id")
    .eq("template_id", params.id)
    .eq("status", "sold")
    .limit(1);
  if (soldLookupError) {
    return NextResponse.json({ error: "Could not delete product template." }, { status: 400 });
  }
  if ((soldItems || []).length > 0) {
    return NextResponse.json(
      { error: "This template has sold accounts. Archive it instead so past order credentials stay available." },
      { status: 409 }
    );
  }

  const { error } = await admin.from("digital_product_templates").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: "Could not delete product template." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
