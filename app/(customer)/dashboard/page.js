import { getSessionProfile, isAdmin } from "@/lib/auth";
import { getUsOnlyCatalog } from "@/lib/usOnlyCatalog";
import WalletBalanceCard from "@/components/WalletBalanceCard";
import QuickLinksGrid from "@/components/QuickLinksGrid";
import DigitalAccountsBrowser from "@/components/DigitalAccountsBrowser";
import WelcomeModal from "@/components/WelcomeModal";

// The dashboard is now wallet + quick links + the full Logs catalog —
// phone-verification buying (DaisySMS quick list, US Only, "Your numbers")
// was pulled off this page per the business owner's request. Those features
// still live on their own pages/nav links (see /products, /products/us-only,
// /rentals) — this is purely about what greets you on the dashboard.
//
// Logs itself used to be a capped 10-item preview here
// (components/LogsQuickList.js) with a "View all" link into the full
// /digital-accounts page. Per the business owner ("remove the view all,
// make that whole page a whole list of products in Logs there"), the
// dashboard now embeds the exact same DigitalAccountsBrowser component the
// full page uses — the uncapped catalog, category picker, and search — so
// there's no separate "view all" hop and Buy already goes straight to
// checkout (components/DigitalAccountCard.js's ProductCard).
export default async function DashboardPage() {
  const { profile, supabase } = await getSessionProfile();
  const admin = isAdmin(profile);

  const [
    { data: onboardingConfig },
    { data: daisysmsConfig },
    { data: daisysimConfig },
    usOnlyCatalog,
    { data: istarConfig },
    { data: socialBoostConfig },
    { data: digitalAccountsConfig },
  ] = await Promise.all([
    supabase.from("onboarding_config").select("*").eq("id", true).maybeSingle(),
    supabase.from("daisysms_config").select("enabled").eq("id", true).maybeSingle(),
    supabase.from("daisysim_config").select("enabled").eq("id", true).maybeSingle(),
    getUsOnlyCatalog(supabase),
    supabase.from("istar_config").select("customer_visible").eq("id", true).maybeSingle(),
    supabase.from("social_boost_config").select("customer_visible").eq("id", true).maybeSingle(),
    supabase.from("digital_accounts_config").select("customer_visible").eq("id", true).maybeSingle(),
  ]);

  // All fail open/closed to their respective defaults — see /admin/providers.
  // These four flags are still needed even though their own buy sections no
  // longer render here — QuickLinksGrid uses them to decide which tiles to
  // show (and to hide a disabled provider's tile entirely, same as the rest
  // of the nav).
  const daisysmsEnabled = daisysmsConfig?.enabled ?? true;
  const daisysimEnabled = daisysimConfig?.enabled ?? false;
  const usOnlyEnabled = usOnlyCatalog.enabled;
  const istarCustomerVisible = istarConfig?.customer_visible ?? false;
  const socialBoostCustomerVisible = socialBoostConfig?.customer_visible ?? false;
  const digitalAccountsCustomerVisible = digitalAccountsConfig?.customer_visible ?? false;
  // Admins always see the catalog here too (same bypass the standalone
  // /digital-accounts page uses), so it can be checked from the dashboard
  // even while still "Coming soon" for customers.
  const showLogs = admin || digitalAccountsCustomerVisible;

  return (
    <div>
      <WelcomeModal config={onboardingConfig} mutedUntil={profile?.onboarding_muted_until} />
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-1">Your wallet and the full Logs catalog.</p>
      </div>

      <div className="mb-7">
        <WalletBalanceCard balance={profile?.balance || 0} />
      </div>

      <QuickLinksGrid
        daisysmsEnabled={daisysmsEnabled}
        daisysimEnabled={daisysimEnabled}
        usOnlyEnabled={usOnlyEnabled}
        isAdmin={admin}
        istarCustomerVisible={istarCustomerVisible}
        socialBoostCustomerVisible={socialBoostCustomerVisible}
        digitalAccountsCustomerVisible={digitalAccountsCustomerVisible}
      />

      {showLogs && (
        <div>
          <h3 className="font-bold text-[15px] mb-3">Logs</h3>
          <DigitalAccountsBrowser />
        </div>
      )}
    </div>
  );
}
