import { createAdminClient } from "@/lib/supabase/admin";
import ProductsList from "@/components/ProductsList";
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
        <ProductsList services={services || []} />
      </div>
    </div>
  );
}
