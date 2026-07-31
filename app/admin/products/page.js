import { createAdminClient } from "@/lib/supabase/admin";
import ProductPriceRow from "@/components/ProductPriceRow";
import SyncServicesButton from "@/components/SyncServicesButton";

export default async function AdminProductsPage() {
  const admin = createAdminClient();
  const { data: services } = await admin
    .from("services")
    .select("*")
    .order("name", { ascending: true });

  return (
    <div>
      <div className="flex items-center justify-between mb-7">
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
        {(services || []).length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-night-400">
            No products synced yet. Click &quot;Sync from DaisySMS&quot; to pull the live list and
            costs.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[1.4fr_1fr_1.2fr_auto] gap-4 pb-3 mb-1 border-b border-gray-100 dark:border-night-700 text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold">
              <div>Product</div>
              <div>Cost</div>
              <div>Customer price (₦)</div>
              <div>Enabled</div>
            </div>
            {(services || []).map((s) => (
              <ProductPriceRow key={s.id} service={s} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
