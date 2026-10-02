import { readObjectBody } from "@/lib/request-body.mjs";
import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchRowsInChunks, upsertRowsInChunks } from "@/lib/supabase/fetchAllRows";

// Bulk-sets markup_ngn for every service currently shown, replacing
// whatever markup (or lack of one — i.e. still inheriting the global
// default) was there before, same "replace, don't add on top" behavior as
// DaisySMS's Products bulk Markup. Preserves favorite/disabled per service —
// see enable-bulk/route.js for why the full row has to be re-sent on upsert.
export async function POST(request) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requestBody = await readObjectBody(request);
  if (!requestBody) return NextResponse.json({ error: "Send a valid JSON object." }, { status: 400 });
  const { services, amount, backend } = requestBody;
  const margin = Number(amount);

  if (!Array.isArray(services) || services.length === 0) {
    return NextResponse.json({ error: "services must be a non-empty array" }, { status: 400 });
  }
  if (!Number.isFinite(margin)) {
    return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
  }
  const resolvedBackend = backend === "daisysim" ? "daisysim" : "getatext";

  const admin = createAdminClient();
  const codes = services.map((s) => s.serviceCode);
  let existing;
  try {
    existing = await fetchRowsInChunks(codes, (chunk) => admin
      .from("daisysim_usa_overrides")
      .select("*")
      .eq("backend", resolvedBackend)
      .in("service_code", chunk));
  } catch {
    return NextResponse.json({ error: "Could not load saved product prices" }, { status: 500 });
  }
  const existingMap = new Map(existing.map((o) => [o.service_code, o]));

  const rows = services.map((s) => {
    const prior = existingMap.get(s.serviceCode);
    return {
      service_code: s.serviceCode,
      backend: resolvedBackend,
      service_name: s.serviceName || prior?.service_name || s.serviceCode,
      favorite: prior?.favorite ?? false,
      disabled: prior?.disabled ?? false,
      markup_ngn: margin,
      updated_at: new Date().toISOString(),
    };
  });

  try {
    await upsertRowsInChunks(admin, "daisysim_usa_overrides", rows, "service_code,backend");
  } catch {
    return NextResponse.json({ error: "Could not update markup" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: rows.length });
}
