import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApps, GetatextError } from "@/lib/getatext";
import { getApps as getAppsUsa, DaisySimUsaError } from "@/lib/daisysimUsa";

// Unlike DaisySMS's /api/admin/services/sync (which caches a manually-priced
// catalog locally — see components/SyncServicesButton.js), "US Only" has no
// persisted price table to begin with: both backends' prices are always
// fetched live (see lib/usOnlyCatalog.js). So this route isn't syncing
// PRICES — it's making sure every service code the CURRENTLY SELECTED
// backend actually returns has a row in daisysim_usa_overrides, with that
// backend's real service name attached. That matters especially right after
// a Getatext <-> DaisySim swap: the two providers have entirely separate
// code namespaces (see schema.sql's comment on
// daisysim_usa_overrides.backend), so switching backends means the admin is
// suddenly looking at a catalog of codes that may never have been touched
// before under that backend. Existing rows only get their service_name
// refreshed — favorite/disabled/markup_ngn are deliberately left untouched
// (the upsert payload below doesn't even include them), same "never silently
// wipe an admin-set flag" principle as the bulk override routes.
export async function POST(request) {
  const { user, profile } = await getSessionProfile();
  if (!user || !isAdmin(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: config } = await admin
    .from("daisysim_usa_config")
    .select("backend")
    .eq("id", true)
    .maybeSingle();
  const backend = config?.backend === "daisysim" ? "daisysim" : "getatext";

  let apps;
  try {
    apps = backend === "daisysim" ? await getAppsUsa() : await getApps();
  } catch (err) {
    const message =
      err instanceof GetatextError || err instanceof DaisySimUsaError
        ? err.message
        : `Could not reach ${backend === "daisysim" ? "DaisySim" : "Getatext"}`;
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (apps.length === 0) {
    return NextResponse.json({ backend, synced: 0, total: 0 });
  }

  const rows = apps
    .filter((a) => a.code)
    .map((a) => ({
      service_code: a.code,
      backend,
      service_name: a.name || a.code,
      updated_at: new Date().toISOString(),
    }));

  const { error } = await admin.from("daisysim_usa_overrides").upsert(rows, { onConflict: "service_code,backend" });
  if (error) return NextResponse.json({ error: "Could not sync catalog" }, { status: 500 });

  return NextResponse.json({ backend, synced: rows.length, total: apps.length });
}
