import { createAdminClient } from "@/lib/supabase/admin";
import { getApps, DaisySimUsaError } from "@/lib/daisysimUsa";
import UsOnlyConfigForm from "@/components/UsOnlyConfigForm";
import UsOnlyOverridesManager from "@/components/UsOnlyOverridesManager";

export default async function AdminUsOnlyPage() {
  const admin = createAdminClient();

  const [{ data: row }, { data: overrides }] = await Promise.all([
    admin.from("daisysim_usa_config").select("*").eq("id", true).maybeSingle(),
    admin.from("daisysim_usa_overrides").select("*"),
  ]);

  const config = {
    enabled: Boolean(row?.enabled),
    markupAmountNgn: row?.markup_amount_ngn ?? 0,
    updatedAt: row?.updated_at ?? null,
  };

  // Catalog browse is best-effort — a missing/invalid DAISYSIM_USA_API_KEY
  // shouldn't take down the whole settings page, just the browse section.
  let services = [];
  let servicesError = "";
  try {
    services = await getApps("USA");
  } catch (err) {
    servicesError = err instanceof DaisySimUsaError ? err.message : "Could not load the service list.";
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">US Only</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          A third provider, separate from the DaisySMS catalog and from "All countries" (DaisySim).
          USA-only, flat service list with live pricing already attached. It's kept off by default
          — turn it on once you're happy with the markup below. Customers only ever see "US Only";
          the DaisySim name is admin-only.
        </p>
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-4">Settings</h3>
        <UsOnlyConfigForm config={config} />
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-1">Catalog — favorites &amp; blocks</h3>
        <p className="text-sm text-gray-400 dark:text-night-400 mb-4 max-w-2xl">
          Prices are live and set by the provider, so they can't be manually overridden here. What
          you can do: pin specific services as favorites (they show pinned at the top of the
          customer's list), or disable specific services so customers can't buy them, without
          touching the global on/off switch above.
        </p>
        {servicesError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{servicesError}</p>
        ) : (
          <UsOnlyOverridesManager services={services} overrides={overrides || []} />
        )}
      </div>
    </div>
  );
}
