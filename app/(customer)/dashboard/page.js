import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUsOnlyCatalog } from "@/lib/usOnlyCatalog";
import WalletBalanceCard from "@/components/WalletBalanceCard";
import QuickBuyList from "@/components/QuickBuyList";
import UsOnlyBuyList from "@/components/UsOnlyBuyList";
import LogsQuickList from "@/components/LogsQuickList";
import NumberCard from "@/components/NumberCard";
import BuyNumberMenu from "@/components/BuyNumberMenu";
import WelcomeModal from "@/components/WelcomeModal";

const LOGS_PREVIEW_COUNT = 6;

// Picks what shows in the dashboard's "Logs" preview: every favorited
// (non-archived) template if any exist, otherwise a random sample — so the
// section is never empty just because an admin hasn't favorited anything
// yet. Stock counts come from the service role key since
// digital_stock_items has no client-facing select policy at all (see
// schema.sql) — this is a Server Component, so that's safe to do inline here
// rather than through a Route Handler.
async function getLogsPreview() {
  const admin = createAdminClient();
  const [{ data: templates }, { data: categories }, { data: stockItems }] = await Promise.all([
    admin.from("digital_product_templates").select("*").eq("archived", false),
    admin.from("digital_categories").select("id, name"),
    admin.from("digital_stock_items").select("template_id, status"),
  ]);

  if (!templates || templates.length === 0) return [];

  const categoryNameById = {};
  for (const c of categories || []) categoryNameById[c.id] = c.name;

  const stockCountByTemplate = {};
  for (const s of stockItems || []) {
    if (s.status !== "available") continue;
    stockCountByTemplate[s.template_id] = (stockCountByTemplate[s.template_id] || 0) + 1;
  }

  const withExtras = templates.map((t) => ({
    ...t,
    categoryName: categoryNameById[t.category_id] || "Logs",
    stockCount: stockCountByTemplate[t.id] || 0,
  }));

  const favorites = withExtras.filter((t) => t.favorite);
  if (favorites.length > 0) return favorites.slice(0, LOGS_PREVIEW_COUNT);

  // No favorites set yet — show a random sample instead of nothing, and
  // shuffle fresh on every dashboard load (not cached) so it doesn't always
  // show the same handful.
  const shuffled = [...withExtras].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, LOGS_PREVIEW_COUNT);
}

export default async function DashboardPage() {
  const { profile, supabase } = await getSessionProfile();

  const [
    { data: services },
    { data: activeRentals },
    { data: onboardingConfig },
    { data: daisysmsConfig },
    { data: daisysimConfig },
    usOnlyCatalog,
    logsPreview,
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
    getLogsPreview(),
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
        <div className="flex items-center gap-2">
          <BuyNumberMenu
            daisysmsEnabled={daisysmsEnabled}
            daisysimEnabled={daisysimEnabled}
            usOnlyEnabled={usOnlyEnabled}
          />
          <Link href="/digital-accounts" className="btn-secondary">
            Buy Logs
          </Link>
        </div>
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

      {usOnlyEnabled && !usOnlyCatalog.error && (
        <div className="mb-7">
          <UsOnlyBuyList services={usOnlyCatalog.services} title="US Only" compact />
        </div>
      )}

      <LogsQuickList items={logsPreview} />

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
