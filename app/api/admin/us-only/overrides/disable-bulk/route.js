import { readObjectBody } from "@/lib/request-body.mjs";
import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchRowsInChunks, upsertRowsInChunks } from "@/lib/supabase/fetchAllRows";

// Bulk "Disable all" — see enable-bulk/route.js for the reasoning behind
// fetching existing rows first and upserting the full row.
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
      disabled: true,
      updated_at: new Date().toISOString(),
    };
  });

  try {
    await upsertRowsInChunks(admin, "daisysim_usa_overrides", rows, "service_code,backend");
  } catch {
    return NextResponse.json({ error: "Could not disable services" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: rows.length });
}
