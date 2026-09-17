import { createAdminClient } from "@/lib/supabase/admin";
import { getApps, GetatextError } from "@/lib/getatext";
import { getApps as getAppsUsa, DaisySimUsaError } from "@/lib/daisysimUsa";
import UsOnlyConfigForm from "@/components/UsOnlyConfigForm";
import UsOnlyOverridesManager from "@/components/UsOnlyOverridesManager";
import UsOnlySyncButton from "@/components/UsOnlySyncButton";

export default async function AdminUsOnlyPage() {
  const admin = createAdminClient();

  const [{ data: row }, { data: usdRateRow }] = await Promise.all([
    admin.from("daisysim_usa_config").select("*").eq("id", true).maybeSingle(),
    admin.from("currency_rates").select("ngn_per_unit").eq("currency", "USD").maybeSingle(),
  ]);

  const config = {
    enabled: Boolean(row?.enabled),
    markupAmountNgn: row?.markup_amount_ngn ?? 0,
    backend: row?.backend === "daisysim" ? "daisysim" : "getatext",
    updatedAt: row?.updated_at ?? null,
  };

  // Scoped to the currently selected backend — see schema.sql's comment on
  // daisysim_usa_overrides.backend. Fetched after `config` so the filter can
  // use its already-resolved backend value.
  const { data: overrides } = await admin
    .from("daisysim_usa_overrides")
    .select("*")
    .eq("backend", config.backend);

  // Needed to offer "show cost in ₦" in the catalog manager below — same
  // pattern as /admin/products' "Show DaisySMS cost in ₦" toggle, and the
  // same toggle just added to /admin/social-boost. Both backends' `price` on
  // each service is always in USD; converting it for display only ever uses
  // this admin-set rate, never touches anything stored. computeNgnPrice is
  // the exact same formula used at actual purchase time (see
  // app/api/us-only/buy/route.js), identical between the two backends.
  const usdRate = usdRateRow ? Number(usdRateRow.ngn_per_unit) : null;

  // Catalog browse is best-effort — a missing/invalid API key for whichever
  // backend is currently selected shouldn't take down the whole settings
  // page, just the browse section. Always browses the CURRENTLY SELECTED
  // backend's catalog, since that's the one new purchases will actually use.
  let services = [];
  let servicesError = "";
  try {
    services = config.backend === "daisysim" ? await getAppsUsa() : await getApps();
  } catch (err) {
    servicesError =
      err instanceof GetatextError || err instanceof DaisySimUsaError ? err.message : "Could not load the service list.";
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">US Only</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          A third provider slot, separate from the DaisySMS catalog and from "All countries"
          (DaisySim). USA-only, flat service list with live pricing already attached — backed by
          EITHER Getatext or DaisySim's own dedicated USA numbers API, whichever is selected below
          (never both at once). It's kept off by default — turn it on once you're happy with the
          markup below. Customers only ever see "US Only"; the provider name is admin-only.
        </p>
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-4">Settings</h3>
        <UsOnlyConfigForm config={config} />
      </div>

      <div className="card card-pad">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <h3 className="font-bold text-[15px]">Catalog — markup, favorites &amp; enable/disable</h3>
          <UsOnlySyncButton />
        </div>
        <p className="text-sm text-gray-400 dark:text-night-400 mb-4 max-w-2xl">
          The selected provider's own cost is live, but the markup on top of it is fully yours to set — per
          service. Set a markup amount and click "Markup" to apply it to every service currently
          shown (search narrows that down first); it replaces whatever was in effect before
          (including the global default set above), so running it again with a new number updates
          all of them at once. Afterward, tweak any individual service's markup, favorite it (pins it
          to the top of the customer's list), or disable it — all independently of the bulk action
          and of the global "Enabled" switch above. Any service left untouched keeps using the
          global default markup from Settings. "Sync catalog" makes sure every service the current
          backend returns shows up here — it runs automatically whenever you switch backends above,
          so you'd only use it manually if the provider added new services since the last swap.
        </p>
        {servicesError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{servicesError}</p>
        ) : (
          <UsOnlyOverridesManager
            services={services}
            overrides={overrides || []}
            usdRate={usdRate}
            markupAmountNgn={config.markupAmountNgn}
            backend={config.backend}
          />
        )}
      </div>
    </div>
  );
}
