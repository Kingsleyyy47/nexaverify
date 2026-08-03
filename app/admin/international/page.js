import { createAdminClient } from "@/lib/supabase/admin";
import { getCountries, DaisySimError } from "@/lib/daisysim";
import InternationalConfigForm from "@/components/InternationalConfigForm";
import InternationalOverridesManager from "@/components/InternationalOverridesManager";

export default async function AdminInternationalPage() {
  const admin = createAdminClient();

  const [{ data: row }, { data: overrides }] = await Promise.all([
    admin.from("daisysim_config").select("*").eq("id", true).maybeSingle(),
    admin.from("daisysim_overrides").select("*"),
  ]);

  const config = {
    enabled: Boolean(row?.enabled),
    markupAmountNgn: row?.markup_amount_ngn ?? 0,
    updatedAt: row?.updated_at ?? null,
  };

  // Catalog browse is best-effort — a missing/invalid DAISYSIM_API_KEY
  // shouldn't take down the whole settings page, just the browse section.
  let countries = [];
  let countriesError = "";
  try {
    countries = await getCountries();
  } catch (err) {
    countriesError = err instanceof DaisySimError ? err.message : "Could not load the country list.";
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">International numbers</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          This product is powered by DaisySim, a second, country+service scoped numbers provider
          separate from the regular DaisySMS catalog customers already use. It's kept off by
          default — turn it on once you're happy with the markup below. Customers only ever see
          "International Numbers"; the DaisySim name is admin-only.
        </p>
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-4">Settings</h3>
        <InternationalConfigForm config={config} />
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-1">Catalog — favorites &amp; blocks</h3>
        <p className="text-sm text-gray-400 dark:text-night-400 mb-4 max-w-2xl">
          DaisySim has no local catalog to sync — countries and services are fetched live, and
          prices are live/expiring tiers that can't be manually priced the way DaisySMS's Products
          page prices each service. What you can do here: pin specific country+service combos as
          favorites (they show pinned at the top of that country's list on the customer side), or
          disable specific combos so customers can't buy them, without touching the global on/off
          switch above.
        </p>
        {countriesError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{countriesError}</p>
        ) : (
          <InternationalOverridesManager countries={countries} overrides={overrides || []} />
        )}
      </div>
    </div>
  );
}
