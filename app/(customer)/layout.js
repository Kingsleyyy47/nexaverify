import { redirect } from "next/navigation";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import CustomerSidebar from "@/components/CustomerSidebar";
import CustomerTopBar from "@/components/CustomerTopBar";
import MobileBottomNav from "@/components/MobileBottomNav";
import { CurrencyProvider } from "@/components/CurrencyProvider";

export default async function CustomerLayout({ children }) {
  const { user, profile, supabase } = await getSessionProfile();
  if (!user) redirect("/login");

  const [
    { data: rates },
    { data: daisysmsConfig },
    { data: daisysimConfig },
    { data: usOnlyConfig },
    { data: istarConfig },
    { data: socialBoostConfig },
  ] = await Promise.all([
    supabase.from("currency_rates").select("*"),
    supabase.from("daisysms_config").select("enabled").eq("id", true).maybeSingle(),
    supabase.from("daisysim_config").select("enabled").eq("id", true).maybeSingle(),
    supabase.from("daisysim_usa_config").select("enabled").eq("id", true).maybeSingle(),
    supabase.from("istar_config").select("customer_visible").eq("id", true).maybeSingle(),
    supabase.from("social_boost_config").select("customer_visible").eq("id", true).maybeSingle(),
  ]);

  // All fail open/closed to their respective defaults (see /admin/providers)
  // — missing row (schema.sql not yet re-run) shouldn't silently hide or
  // wrongly show a provider's nav link.
  const daisysmsEnabled = daisysmsConfig?.enabled ?? true;
  const daisysimEnabled = daisysimConfig?.enabled ?? false;
  const usOnlyEnabled = usOnlyConfig?.enabled ?? false;
  const istarCustomerVisible = istarConfig?.customer_visible ?? false;
  const socialBoostCustomerVisible = socialBoostConfig?.customer_visible ?? false;

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
        />
        <main className="flex-1 p-4 pb-24 md:p-9 max-w-6xl w-full">
          <CustomerTopBar balance={profile?.balance || 0} />
          {children}
        </main>
      </div>
      <MobileBottomNav
        isAdmin={isAdmin(profile)}
        istarCustomerVisible={istarCustomerVisible}
        socialBoostCustomerVisible={socialBoostCustomerVisible}
      />
    </CurrencyProvider>
  );
}
