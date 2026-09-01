import { createAdminClient } from "@/lib/supabase/admin";
import { getApps, GetatextError } from "@/lib/getatext";
import UsOnlyConfigForm from "@/components/UsOnlyConfigForm";
import UsOnlyOverridesManager from "@/components/UsOnlyOverridesManager";

export default async function AdminUsOnlyPage() {
  const admin = createAdminClient();

  const [{ data: row }, { data: overrides }, { data: usdRateRow }] = await Promise.all([
    admin.from("daisysim_usa_config").select("*").eq("id", true).maybeSingle(),
    admin.from("daisysim_usa_overrides").select("*"),
    admin.from("currency_rates").select("ngn_per_unit").eq("currency", "USD").maybeSingle(),
  ]);

  const config = {
    enabled: Boolean(row?.enabled),
    markupAmountNgn: row?.markup_amount_ngn ?? 0,
    updatedAt: row?.updated_at ?? null,
  };

  // Needed to offer "show cost in ₦" in the catalog manager below — same
  // pattern as /admin/products' "Show DaisySMS cost in ₦" toggle, and the
  // same toggle just added to /admin/social-boost. Getatext's own `price` on
  // each service is always in USD; converting it for display only ever uses
  // this admin-set rate, never touches anything stored. computeNgnPrice is
  // the exact same formula used at actual purchase time (see
  // app/api/us-only/buy/route.js) — unchanged from when this product was
  // still backed by DaisySim's server7 API, so the admin-facing calculation
  // hasn't changed just because the provider behind it has.
  const usdRate = usdRateRow ? Number(usdRateRow.ngn_per_unit) : null;

  // Catalog browse is best-effort — a missing/invalid GETATEXT_API_KEY
  // shouldn't take down the whole settings page, just the browse section.
  let services = [];
  let servicesError = "";
  try {
    services = await getApps();
  } catch (err) {
    servicesError = err instanceof GetatextError ? err.message : "Could not load the service list.";
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">US Only</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          A third provider, separate from the DaisySMS catalog and from "All countries" (DaisySim).
          USA-only, flat service list with live pricing already attached, backed by Getatext. It's
          kept off by default — turn it on once you're happy with the markup below. Customers only
          ever see "US Only"; the Getatext name is admin-only.
        </p>
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-4">Settings</h3>
        <UsOnlyConfigForm config={config} />
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-1">Catalog — markup, favorites &amp; enable/disable</h3>
        <p className="text-sm text-gray-400 dark:text-night-400 mb-4 max-w-2xl">
          Getatext's own cost is live, but the markup on top of it is fully yours to set — per
          service. Set a markup amount and click "Markup" to apply it to every service currently
          shown (search narrows that down first); it replaces whatever was in effect before
          (including the global default set above), so running it again with a new number updates
          all of them at once. Afterward, tweak any individual service's markup, favorite it (pins it
          to the top of the customer's list), or disable it — all independently of the bulk action
          and of the global "Enabled" switch above. Any service left untouched keeps using the
          global default markup from Settings.
        </p>
        {servicesError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{servicesError}</p>
        ) : (
          <UsOnlyOverridesManager
            services={services}
            overrides={overrides || []}
            usdRate={usdRate}
            markupAmountNgn={config.markupAmountNgn}
          />
        )}
      </div>
    </div>
  );
}
