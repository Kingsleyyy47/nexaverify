import { createAdminClient } from "@/lib/supabase/admin";
import ProductsList from "@/components/ProductsList";
import SyncServicesButton from "@/components/SyncServicesButton";

export default async function AdminProductsPage() {
  const admin = createAdminClient();
  const { data: services } = await admin
    .from("services")
    .select("*")
    .order("name", { ascending: true });

  // Needed to offer "show DaisySMS cost in ₦" — last_price is always in USD
  // (it's also the maxPrice cap sent to DaisySMS's getNumber call, which is
  // dollar-denominated per their docs), so converting it for display only
  // ever uses the admin-set USD rate, never touches the stored value.
  const { data: usdRateRow } = await admin
    .from("currency_rates")
    .select("ngn_per_unit")
    .eq("currency", "USD")
    .maybeSingle();
  const usdRate = usdRateRow ? Number(usdRateRow.ngn_per_unit) : null;

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-7">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
            DaisySMS's cost is on the left; set what NexaVerify actually charges customers (in
            Naira) on the right. That price — not DaisySMS's live rate — is what gets charged at
            checkout.
          </p>
        </div>
        <SyncServicesButton />
      </div>

      <div className="card card-pad">
        <ProductsList services={services || []} usdRate={usdRate} />
      </div>
    </div>
  );
}
