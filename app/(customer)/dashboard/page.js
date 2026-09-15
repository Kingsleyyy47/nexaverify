import Link from "next/link";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { getUsOnlyCatalog } from "@/lib/usOnlyCatalog";
import { createAdminClient } from "@/lib/supabase/admin";
import WalletBalanceCard from "@/components/WalletBalanceCard";
import QuickBuyList from "@/components/QuickBuyList";
import UsOnlyBuyList from "@/components/UsOnlyBuyList";
import LogsQuickList from "@/components/LogsQuickList";
import QuickLinksGrid from "@/components/QuickLinksGrid";
import NumberCard from "@/components/NumberCard";
import BuyNumberMenu from "@/components/BuyNumberMenu";
import WelcomeModal from "@/components/WelcomeModal";

// Small, capped preview for the dashboard's horizontally-scrolling "Logs"
// carousel (components/LogsQuickList.js) — favorited templates first, then
// whatever's oldest, same ordering as the full catalog
// (app/api/digital-accounts/templates/route.js). Uses the admin client
// because digital_stock_items has no client-facing select policy at all
// (see schema.sql) — same reason that route does. Fetched unconditionally
// (cheap, capped query) and only ever rendered when
// digital_accounts_config.customer_visible is on, same pattern this page
// already uses for US Only's catalog fetch.
const DIGITAL_ACCOUNTS_PREVIEW_LIMIT = 10;

async function loadDigitalAccountsPreview() {
  const admin = createAdminClient();

  const { data: templates } = await admin
    .from("digital_product_templates")
    .select("id, category_id, description, price_ngn, favorite")
    .eq("archived", false)
    .order("favorite", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(DIGITAL_ACCOUNTS_PREVIEW_LIMIT);

  if (!templates || templates.length === 0) return [];

  const templateIds = templates.map((t) => t.id);
  const categoryIds = [...new Set(templates.map((t) => t.category_id))];

  const [{ data: stockItems }, { data: categories }] = await Promise.all([
    admin
      .from("digital_stock_items")
      .select("template_id")
      .eq("status", "available")
      .in("template_id", templateIds),
    admin.from("digital_categories").select("id, name, logo_url, logo_url_dark").in("id", categoryIds),
  ]);

  const stockCountByTemplate = {};
  for (const s of stockItems || []) {
    stockCountByTemplate[s.template_id] = (stockCountByTemplate[s.template_id] || 0) + 1;
  }
  const categoryById = {};
  for (const c of categories || []) categoryById[c.id] = c;

  return templates.map((t) => {
    const category = categoryById[t.category_id];
    return {
      id: t.id,
      description: t.description,
      price_ngn: t.price_ngn,
      favorite: t.favorite,
      stockCount: stockCountByTemplate[t.id] || 0,
      // categoryId is what LogsQuickList.js groups by AND hashes for its
      // colored banner (lib/categoryColors.js) — same key the full
      // /digital-accounts page hashes, so a given category always gets the
      // same banner color on both.
      categoryId: t.category_id,
      categoryName: category?.name || null,
      logoUrl: category?.logo_url || null,
      logoUrlDark: category?.logo_url_dark || null,
    };
  });
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
    { data: istarConfig },
    { data: socialBoostConfig },
    { data: digitalAccountsConfig },
    digitalAccountsPreview,
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
    supabase.from("istar_config").select("customer_visible").eq("id", true).maybeSingle(),
    supabase.from("social_boost_config").select("customer_visible").eq("id", true).maybeSingle(),
    supabase.from("digital_accounts_config").select("customer_visible").eq("id", true).maybeSingle(),
    loadDigitalAccountsPreview(),
  ]);

  // All fail open/closed to their respective defaults — see /admin/providers.
  const daisysmsEnabled = daisysmsConfig?.enabled ?? true;
  const daisysimEnabled = daisysimConfig?.enabled ?? false;
  const usOnlyEnabled = usOnlyCatalog.enabled;
  const istarCustomerVisible = istarConfig?.customer_visible ?? false;
  const socialBoostCustomerVisible = socialBoostConfig?.customer_visible ?? false;
  const digitalAccountsCustomerVisible = digitalAccountsConfig?.customer_visible ?? false;

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

      <div className="mb-7">
        <WalletBalanceCard balance={profile?.balance || 0} />
      </div>

      <QuickLinksGrid
        daisysmsEnabled={daisysmsEnabled}
        daisysimEnabled={daisysimEnabled}
        usOnlyEnabled={usOnlyEnabled}
        isAdmin={isAdmin(profile)}
        istarCustomerVisible={istarCustomerVisible}
        socialBoostCustomerVisible={socialBoostCustomerVisible}
        digitalAccountsCustomerVisible={digitalAccountsCustomerVisible}
      />

      {digitalAccountsCustomerVisible && <LogsQuickList items={digitalAccountsPreview} />}

      <div className="card card-pad mb-7">
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
