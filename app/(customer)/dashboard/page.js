import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { getUsOnlyCatalog } from "@/lib/usOnlyCatalog";
import WalletBalanceCard from "@/components/WalletBalanceCard";
import QuickBuyList from "@/components/QuickBuyList";
import UsOnlyBuyList from "@/components/UsOnlyBuyList";
import QuickLinksGrid from "@/components/QuickLinksGrid";
import NumberCard from "@/components/NumberCard";
import BuyNumberMenu from "@/components/BuyNumberMenu";
import WelcomeModal from "@/components/WelcomeModal";

export default async function DashboardPage() {
  const { profile, supabase } = await getSessionProfile();

  const [
    { data: services },
    { data: activeRentals },
    { data: onboardingConfig },
    { data: daisysmsConfig },
    { data: daisysimConfig },
    usOnlyCatalog,
  ] = await Promise.all([
    supabase
      .from("services")
      .select("*")
      .eq("enabled", true)
      .not("customer_price", "is", null)
      // Favorited products (toggled in /admin/products) sort to the top of
      // this same list — not a separate section — everything else stays
      // alphabetical after them.
      .order("favorite", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("rentals")
      .select("*")
      .in("status", ["waiting", "received"])
      .order("created_at", { ascending: false }),
    supabase.from("onboarding_config").select("*").eq("id", true).maybeSingle(),
    supabase.from("daisysms_config").select("enabled").eq("id", true).maybeSingle(),
    supabase.from("daisysim_config").select("enabled").eq("id", true).maybeSingle(),
    getUsOnlyCatalog(supabase),
  ]);

  // All fail open/closed to their respective defaults — see /admin/providers.
  const daisysmsEnabled = daisysmsConfig?.enabled ?? true;
  const daisysimEnabled = daisysimConfig?.enabled ?? false;
  const usOnlyEnabled = usOnlyCatalog.enabled;

  return (
    <div>
      <WelcomeModal config={onboardingConfig} mutedUntil={profile?.onboarding_muted_until} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-7">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">Your wallet and recent activity.</p>
        </div>
        <BuyNumberMenu
          daisysmsEnabled={daisysmsEnabled}
          daisysimEnabled={daisysimEnabled}
          usOnlyEnabled={usOnlyEnabled}
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-5 mb-7 items-stretch">
        <WalletBalanceCard balance={profile?.balance || 0} />

        <div className="card card-pad">
          <div className="text-sm text-gray-500 dark:text-night-400 font-semibold mb-2">
            Active rentals
          </div>
          <div className="text-3xl font-bold">{activeRentals?.length || 0}</div>
          <Link
            href="/rentals"
            className="text-xs font-semibold text-brand-700 dark:text-brand-400 mt-2 inline-block"
          >
            View rentals →
          </Link>
        </div>
      </div>

      <QuickLinksGrid
        daisysmsEnabled={daisysmsEnabled}
        daisysimEnabled={daisysimEnabled}
        usOnlyEnabled={usOnlyEnabled}
      />

      {usOnlyEnabled && !usOnlyCatalog.error && (
        <div className="mb-7">
          <UsOnlyBuyList services={usOnlyCatalog.services} title="US Only" compact />
        </div>
      )}

      {daisysmsEnabled && (
        <div className="mb-7">
          <QuickBuyList services={services || []} />
        </div>
      )}

      <div>
        <h3 className="font-bold text-[15px] mb-3">Your numbers</h3>
        {(activeRentals || []).length === 0 ? (
          <div className="card card-pad text-sm text-gray-400 dark:text-night-400">
            No active numbers yet — buy one above and it&apos;ll show up here with its code.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {activeRentals.map((r) => (
              <NumberCard key={r.id} rental={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
