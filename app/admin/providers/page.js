import { createAdminClient } from "@/lib/supabase/admin";
import ProvidersConfigForm from "@/components/ProvidersConfigForm";

export default async function AdminProvidersPage() {
  const admin = createAdminClient();

  const [{ data: daisysms }, { data: daisysim }, { data: usOnly }, { data: pocketfi }, { data: istar }, { data: socialBoost }] =
    await Promise.all([
      admin.from("daisysms_config").select("enabled").eq("id", true).maybeSingle(),
      admin.from("daisysim_config").select("enabled").eq("id", true).maybeSingle(),
      admin.from("daisysim_usa_config").select("enabled").eq("id", true).maybeSingle(),
      admin.from("pocketfi_config").select("virtual_account_enabled").eq("id", true).maybeSingle(),
      admin.from("istar_config").select("enabled").eq("id", true).maybeSingle(),
      admin.from("social_boost_config").select("enabled").eq("id", true).maybeSingle(),
    ]);

  const config = {
    daisysmsEnabled: daisysms?.enabled ?? true,
    daisysimEnabled: daisysim?.enabled ?? false,
    usOnlyEnabled: usOnly?.enabled ?? false,
    pocketfiVirtualAccountEnabled: pocketfi?.virtual_account_enabled ?? true,
    istarEnabled: istar?.enabled ?? false,
    socialBoostEnabled: socialBoost?.enabled ?? false,
  };

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">APIs &amp; Providers</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          One place to switch a whole provider on or off — for customers, that means its entire
          section (nav link, product list, purchase flow) disappears the moment you flip it off,
          and comes right back when you flip it on. No redeploy needed either way. This writes to
          the same settings each provider's own detailed page uses — just faster to reach in an
          emergency.
        </p>
      </div>

      <div className="card card-pad">
        <ProvidersConfigForm config={config} />
      </div>
    </div>
  );
}
