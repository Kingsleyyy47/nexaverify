import { getSessionProfile } from "@/lib/auth";
import { getCountries, DaisySimError } from "@/lib/daisysim";
import InternationalBuyForm from "@/components/InternationalBuyForm";

// Second phone-number provider alongside the main /products catalog (see
// app/(customer)/products/page.js) — country + service scoped, live pricing,
// no admin pre-sync needed. Deliberately never mentions the provider by name
// to customers (same white-labeling as the rest of the app never mentioning
// DaisySMS) — just "international numbers".
export default async function InternationalProductsPage() {
  const { supabase } = await getSessionProfile();

  const { data: config } = await supabase
    .from("daisysim_config")
    .select("enabled")
    .eq("id", true)
    .maybeSingle();

  if (!config?.enabled) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">International Numbers</h1>
        <div className="card card-pad text-sm text-gray-500 dark:text-night-400">
          International numbers aren&apos;t available right now — check back soon.
        </div>
      </div>
    );
  }

  let countries = [];
  let loadError = "";
  try {
    countries = await getCountries();
  } catch (err) {
    loadError = err instanceof DaisySimError ? err.message : "Could not load countries right now.";
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">International Numbers</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          Pick a country and service — pricing updates live and numbers are rented instantly from
          your wallet balance.
        </p>
      </div>

      {loadError ? (
        <div className="card card-pad text-sm text-red-600">{loadError}</div>
      ) : (
        <InternationalBuyForm countries={countries} />
      )}
    </div>
  );
}
