import { readObjectBody } from "@/lib/request-body.mjs";
import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchRowsInChunks, upsertRowsInChunks } from "@/lib/supabase/fetchAllRows";

// Bulk "Enable all" for the US Only catalog manager — sets disabled=false
// for every service currently shown (respects the search filter, same as
// DaisySMS's Products page). Fetches existing override rows first and
// upserts the FULL row for each, preserving favorite/markup_ngn — Supabase's
// .upsert() replaces the whole row, not just the column you meant to touch,
// so skipping this step would silently wipe out any favorite/markup already
// set on a service that also happens to get enabled here.
export async function POST(request) {
  const { profile } = await getSessionProfile();
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requestBody = await readObjectBody(request);
  if (!requestBody) return NextResponse.json({ error: "Send a valid JSON object." }, { status: 400 });
  const { services, backend } = requestBody;
  if (!Array.isArray(services) || services.length === 0) {
    return NextResponse.json({ error: "services must be a non-empty array" }, { status: 400 });
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
    return NextResponse.json({ error: "Could not load saved product settings" }, { status: 500 });
  }
  const existingMap = new Map(existing.map((o) => [o.service_code, o]));

  const rows = services.map((s) => {
    const prior = existingMap.get(s.serviceCode);
    return {
      service_code: s.serviceCode,
      backend: resolvedBackend,
      service_name: s.serviceName || prior?.service_name || s.serviceCode,
      favorite: prior?.favorite ?? false,
      markup_ngn: prior?.markup_ngn ?? null,
      disabled: false,
      updated_at: new Date().toISOString(),
    };
  });

  try {
    await upsertRowsInChunks(admin, "daisysim_usa_overrides", rows, "service_code,backend");
  } catch {
    return NextResponse.json({ error: "Could not enable services" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: rows.length });
}
