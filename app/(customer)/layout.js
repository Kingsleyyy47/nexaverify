import { redirect } from "next/navigation";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import CustomerSidebar from "@/components/CustomerSidebar";
import CustomerTopBar from "@/components/CustomerTopBar";
import MobileBottomNav from "@/components/MobileBottomNav";
import { CurrencyProvider } from "@/components/CurrencyProvider";

export default async function CustomerLayout({ children }) {
  const { user, profile, profileError } = await getSessionProfile();
  if (!user) redirect("/login");
  const admin = createAdminClient();

  const [
    { data: rates, error: ratesError },
    { data: daisysmsConfig },
    { data: daisysimConfig },
    { data: usOnlyConfig },
    { data: istarConfig },
    { data: socialBoostConfig },
    { data: digitalAccountsConfig },
  ] = await Promise.all([
    // These rates are public display data. Read them server-side independently
    // of the visitor's session so a failed authenticated query cannot make
    // NGN amounts appear unchanged under USD/GBP/EUR symbols.
    admin.from("currency_rates").select("currency, ngn_per_unit"),
    admin.from("daisysms_config").select("enabled").eq("id", true).maybeSingle(),
    admin.from("daisysim_config").select("enabled").eq("id", true).maybeSingle(),
    admin.from("daisysim_usa_config").select("enabled").eq("id", true).maybeSingle(),
    admin.from("istar_config").select("customer_visible").eq("id", true).maybeSingle(),
    admin.from("social_boost_config").select("customer_visible").eq("id", true).maybeSingle(),
    admin.from("digital_accounts_config").select("customer_visible").eq("id", true).maybeSingle(),
  ]);

  // All fail open/closed to their respective defaults (see /admin/providers)
  // — missing row (schema.sql not yet re-run) shouldn't silently hide or
  // wrongly show a provider's nav link.
  const daisysmsEnabled = daisysmsConfig?.enabled ?? true;
  const daisysimEnabled = daisysimConfig?.enabled ?? false;
  const usOnlyEnabled = usOnlyConfig?.enabled ?? false;
  const istarCustomerVisible = istarConfig?.customer_visible ?? false;
  const socialBoostCustomerVisible = socialBoostConfig?.customer_visible ?? false;
  const digitalAccountsCustomerVisible = digitalAccountsConfig?.customer_visible ?? false;
  const missingRates = ["USD", "GBP", "EUR"].some(
    (currency) => !rates?.some((rate) => rate.currency === currency && Number(rate.ngn_per_unit) > 0)
  );

  return (
    <CurrencyProvider rates={rates}>
      <div className="min-h-screen flex flex-col md:flex-row">
        <CustomerSidebar
          profile={profile}
          daisysmsEnabled={daisysmsEnabled}
          daisysimEnabled={daisysimEnabled}
          usOnlyEnabled={usOnlyEnabled}
          istarCustomerVisible={istarCustomerVisible}
          socialBoostCustomerVisible={socialBoostCustomerVisible}
          digitalAccountsCustomerVisible={digitalAccountsCustomerVisible}
        />
        <main className="flex-1 p-4 pb-24 md:p-9 max-w-6xl w-full">
          {profileError && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              Couldn&apos;t load your account data just now. Please refresh the page.
            </div>
          )}
          {(ratesError || missingRates) && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              Currency rates couldn&apos;t be loaded. Other currency amounts are unavailable until you refresh.
            </div>
          )}
          <CustomerTopBar balance={profile?.balance ?? null} />
          {children}
        </main>
      </div>
      <MobileBottomNav
        isAdmin={isAdmin(profile)}
        istarCustomerVisible={istarCustomerVisible}
        socialBoostCustomerVisible={socialBoostCustomerVisible}
        digitalAccountsCustomerVisible={digitalAccountsCustomerVisible}
      />
    </CurrencyProvider>
  );
}
