import { createAdminClient } from "@/lib/supabase/admin";
import InternationalConfigForm from "@/components/InternationalConfigForm";

export default async function AdminInternationalPage() {
  const admin = createAdminClient();
  const { data: row } = await admin.from("daisysim_config").select("*").eq("id", true).maybeSingle();

  const config = {
    enabled: Boolean(row?.enabled),
    markupAmountNgn: row?.markup_amount_ngn ?? 0,
    updatedAt: row?.updated_at ?? null,
  };

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">International numbers</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          This product is powered by DaisySim, a second, country+service scoped numbers provider
          separate from the regular DaisySMS catalog customers already use. It's kept off by
          default — turn it on once you're happy with the markup below. Customers only ever see
          "International Numbers"; the DaisySim name is admin-only.
        </p>
      </div>

      <div className="card card-pad">
        <InternationalConfigForm config={config} />
      </div>
    </div>
  );
}
