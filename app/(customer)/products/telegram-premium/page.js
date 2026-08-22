import { getSessionProfile, isAdmin } from "@/lib/auth";
import { getPremiumPackages, buildPremiumPricing } from "@/lib/istar";
import TelegramGiftBuyForm from "@/components/TelegramGiftBuyForm";

// Admins always see the real buy flow here (to test it end-to-end with their
// own wallet), gated only by istar_config.enabled in the API routes.
// Everyone else additionally needs istar_config.customer_visible — a
// SEPARATE, off-by-default switch from `enabled`, flipped on at
// /admin/telegram-premium only once you're happy with testing. See that
// column's comment in schema.sql for the reasoning.
export default async function TelegramPremiumPage() {
  const { profile, supabase } = await getSessionProfile();
  const admin = isAdmin(profile);

  // select("*") on purpose, matching /admin/telegram-premium — an explicit
  // column list here silently breaks (query errors, config comes back null,
  // every price collapses to "—") any time a new istar_config column exists
  // in code but the SQL migration hasn't landed on this DB yet. select("*")
  // never errors just because extra columns exist that this page doesn't use.
  const { data: config } = await supabase.from("istar_config").select("*").eq("id", true).maybeSingle();

  const customerVisible = Boolean(config?.customer_visible);

  if (!admin && !customerVisible) {
    return (
      <div>
        <div className="mb-7">
          <h1 className="text-2xl font-bold">Telegram Premium</h1>
          <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
            Gift Telegram Stars and Telegram Premium subscriptions.
          </p>
        </div>
        <div className="card card-pad text-sm text-gray-500 dark:text-night-400">
          Coming soon — check back later.
        </div>
      </div>
    );
  }

  // Best-effort live pricing for display only — the buy route always
  // re-fetches and re-computes this itself at purchase time, so a failure
  // here just means the price preview is blank, not that pricing is wrong.
  const { data: usdRateRow } = await supabase
    .from("currency_rates")
    .select("ngn_per_unit")
    .eq("currency", "USD")
    .maybeSingle();
  const usdRate = usdRateRow ? Number(usdRateRow.ngn_per_unit) : null;

  let premiumPricing = { 3: null, 6: null, 12: null };
  try {
    const packages = await getPremiumPackages();
    premiumPricing = buildPremiumPricing(packages, usdRate, {
      3: config?.premium_markup_3,
      6: config?.premium_markup_6,
      12: config?.premium_markup_12,
    });
  } catch {
    // leave as nulls — form shows "—" for price and still lets the flow run
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Telegram Premium</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          {admin && !customerVisible
            ? 'Admin test view — customers currently see this as "Coming soon" until you flip on customer visibility in admin settings. Purchases here debit your own wallet balance, exactly like a real customer purchase would.'
            : "Gift Telegram Stars and Telegram Premium subscriptions — paid straight from your wallet balance."}
        </p>
      </div>
      <TelegramGiftBuyForm
        isAdminView={admin}
        starPricingConfig={{
          ngnPerStar: config?.ngn_per_star,
          flatMarkupUnder1000: config?.star_flat_markup_under_1000_ngn,
          flatMarkupOver1000: config?.star_flat_markup_1000_plus_ngn,
          starLastCostNgn: config?.star_last_cost_ngn,
        }}
        premiumPricing={premiumPricing}
      />
    </div>
  );
}
