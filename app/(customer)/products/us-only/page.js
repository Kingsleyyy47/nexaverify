import { getSessionProfile } from "@/lib/auth";
import { getUsOnlyCatalog } from "@/lib/usOnlyCatalog";
import UsOnlyBuyList from "@/components/UsOnlyBuyList";

// Third phone-number provider alongside /products (DaisySMS) and
// /products/international (DaisySim "All countries") — USA-only, flat
// catalog with prices already attached, so this is a straight tap-to-buy
// list rather than a country/tier drill-down. Deliberately never names the
// provider to customers, same white-labeling as the rest of the app.
export default async function UsOnlyProductsPage() {
  const { supabase } = await getSessionProfile();
  const { enabled, services, error } = await getUsOnlyCatalog(supabase);

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">US Only</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          USA virtual numbers — tap a service to rent instantly from your wallet balance.
        </p>
      </div>

      {!enabled ? (
        <div className="card card-pad text-sm text-gray-500 dark:text-night-400">
          This service isn&apos;t available right now — check back soon.
        </div>
      ) : error ? (
        <div className="card card-pad text-sm text-red-600">{error}</div>
      ) : (
        <UsOnlyBuyList services={services} title="USA numbers" />
      )}
    </div>
  );
}
