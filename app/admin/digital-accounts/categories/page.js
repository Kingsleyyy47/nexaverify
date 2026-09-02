import { createAdminClient } from "@/lib/supabase/admin";
import CategoryManager from "@/components/CategoryManager";
import DigitalAccountsConfigForm from "@/components/DigitalAccountsConfigForm";

export default async function AdminDigitalCategoriesPage() {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("digital_accounts_config")
    .select("customer_visible")
    .eq("id", true)
    .maybeSingle();
  const config = { customerVisible: Boolean(row?.customer_visible) };

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">Category Management</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          Manage product categories and organization. Create a category here first, then add
          product templates under it at Product Templates.
        </p>
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-4">Settings</h3>
        <DigitalAccountsConfigForm config={config} />
      </div>

      <div className="card card-pad">
        <CategoryManager />
      </div>
    </div>
  );
}
