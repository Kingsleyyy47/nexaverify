import { createAdminClient } from "@/lib/supabase/admin";
import PocketfiConfigForm from "@/components/PocketfiConfigForm";

export default async function AdminPocketfiPage() {
  const admin = createAdminClient();
  const { data: row } = await admin.from("pocketfi_config").select("*").eq("id", true).maybeSingle();

  const config = {
    virtualAccountEnabled: row?.virtual_account_enabled ?? true,
    virtualAccountBank: row?.virtual_account_bank ?? "kuda",
    updatedAt: row?.updated_at ?? null,
  };

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">PocketFi funding</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          Controls the permanent dedicated-account-number top-up flow customers see on /topup.
          Changing the bank only applies to accounts issued from now on.
        </p>
      </div>

      <div className="card card-pad">
        <PocketfiConfigForm config={config} />
      </div>
    </div>
  );
}
