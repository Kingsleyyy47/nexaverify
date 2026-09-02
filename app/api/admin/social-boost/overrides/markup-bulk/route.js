import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
const CHUNK_SIZE = 500;

// Sets Social Boost markup. The normal /admin/social-boost bulk Save writes
// one site-wide markup setting to social_boost_config and clears per-service
// markup_custom flags, so old/toggle-created override rows with ₦0 cannot
// shadow the site-wide customer price. Filtered/custom callers can still
// send an explicit services list; those rows are marked custom. Either way,
// this REPLACES the previous markup instead of adding on top of it, so
// running it twice with the same amount is idempotent. An admin can still
// tweak any individual service afterward without that service being pulled
// back to the global value until the global Save is run again.
//
// `mode` picks which of the two markup calculations this run writes — a
// toggle button next to the amount input on the page switches it:
//   "flat" (default): markup_ngn, a flat Naira amount added once per order.
//   "percent": markup_percent, a % of that order's own USD->NGN cost — see
//     the big comment on social_boost_overrides.markup_type in schema.sql
//     for why this needs its own column rather than reusing markup_ngn.
// Whichever mode ISN'T picked is left untouched on each row (not zeroed) so
// switching back later doesn't lose the old number — markup_type is what
// actually decides which one pricing uses.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { services, amount, mode, scope } = await request.json();
  const markup = Number(amount);
  const markupType = mode === "percent" ? "percent" : "flat";

  if (!Number.isFinite(markup) || markup < 0) {
    return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
  }
  if (markupType === "percent" && markup > 100000) {
    return NextResponse.json({ error: "Enter a realistic percentage" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (scope === "all") {
    const configUpdate = {
      markup_type: markupType,
      ...(markupType === "flat" ? { markup_ngn: markup } : { markup_percent: markup }),
      updated_at: new Date().toISOString(),
    };
    const { error: configError } = await admin
      .from("social_boost_config")
      .upsert({ id: true, ...configUpdate }, { onConflict: "id" });
    if (configError) return NextResponse.json({ error: "Could not update prices" }, { status: 500 });

    const { error: clearCustomError } = await admin
      .from("social_boost_overrides")
      .update({
        markup_custom: false,
        updated_at: new Date().toISOString(),
      })
      .neq("service_id", 0);
    if (clearCustomError) return NextResponse.json({ error: "Could not update prices" }, { status: 500 });

    return NextResponse.json({ ok: true, scope: "all" });
  }

  const serviceRefs = Array.isArray(services) ? services : [];
  if (serviceRefs.length === 0) {
    return NextResponse.json({ error: "No services found to update" }, { status: 400 });
  }

  const refsById = new Map();
  for (const s of serviceRefs) {
    const id = Number(s.serviceId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Every service needs a valid service ID" }, { status: 400 });
    }
    if (!refsById.has(id)) {
      refsById.set(id, { serviceId: id, serviceName: s.serviceName || null });
    }
  }

  const refs = [...refsById.values()];
  const ids = refs.map((s) => s.serviceId);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Every service needs a valid service ID" }, { status: 400 });
  }

  const existing = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const { data, error } = await admin.from("social_boost_overrides").select("*").in("service_id", chunk);
    if (error) return NextResponse.json({ error: "Could not update prices" }, { status: 500 });
    existing.push(...(data || []));
  }
  const existingMap = new Map(existing.map((o) => [o.service_id, o]));

  const now = new Date().toISOString();
  const updates = refs.map((s) => {
    const id = Number(s.serviceId);
    const prior = existingMap.get(id);
    return {
      service_id: id,
      service_name: s.serviceName || prior?.service_name || null,
      enabled: prior?.enabled ?? true,
      favorite: Boolean(prior?.favorite),
      markup_type: markupType,
      markup_ngn: markupType === "flat" ? markup : Number(prior?.markup_ngn || 0),
      markup_percent: markupType === "percent" ? markup : Number(prior?.markup_percent || 0),
      markup_custom: true,
      updated_at: now,
    };
  });

  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    const { error } = await admin.from("social_boost_overrides").upsert(chunk, { onConflict: "service_id" });
    if (error) return NextResponse.json({ error: "Could not update prices" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: updates.length });
}
