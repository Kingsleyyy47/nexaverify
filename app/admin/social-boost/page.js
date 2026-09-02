import { createAdminClient } from "@/lib/supabase/admin";
import { getBalance, SocialBoostError } from "@/lib/socialboost";
import SocialBoostConfigForm from "@/components/SocialBoostConfigForm";
import SocialBoostCatalogManager from "@/components/SocialBoostCatalogManager";

export default async function AdminSocialBoostPage() {
  const admin = createAdminClient();

  const { data: row } = await admin.from("social_boost_config").select("*").eq("id", true).maybeSingle();
  const config = {
    enabled: Boolean(row?.enabled),
    customerVisible: Boolean(row?.customer_visible),
  };

  // Best-effort — a missing/invalid SOCIAL_BOOST_API_KEY shouldn't take down
  // the whole settings page, just the balance display.
  let balance = null;
  let balanceError = "";
  try {
    balance = await getBalance();
  } catch (err) {
    balanceError = err instanceof SocialBoostError ? err.message : "Could not load balance.";
  }

  // Needed to offer "show cost in ₦" in the catalog manager below — same
  // pattern as /admin/products' "Show DaisySMS cost in ₦" toggle. Services'
  // own `rate` is always in USD; converting it for display only ever uses
  // this admin-set rate, never touches anything stored.
  const { data: usdRateRow } = await admin
    .from("currency_rates")
    .select("ngn_per_unit")
    .eq("currency", "USD")
    .maybeSingle();
  const usdRate = usdRateRow ? Number(usdRateRow.ngn_per_unit) : null;

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">Social Boost</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          Followers, likes, views, and comments via thelordofthepanels.com's SMM panel API — billed
          from the site's own account balance there, same two-switch shape as Telegram Premium:
          "Enabled" is your own test-ordering access at /products/social-boost, always available to
          you as admin; "Let customers see it" is a second, off-by-default switch that opens the real
          buy flow to everyone else too. Each service's markup is set in the catalog below (bulk or
          individually) — a customer pays the panel's own cost, converted to Naira at your currently
          configured USD rate, plus that markup.
        </p>
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-1">Panel balance</h3>
        {balanceError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{balanceError}</p>
        ) : (
          <p className="text-lg font-bold text-gray-900 dark:text-night-50">
            {balance ? `${balance.balance} ${balance.currency || ""}` : "—"}
          </p>
        )}
        <p className="text-sm text-gray-500 dark:text-night-300 mt-2">
          This is what funds every order. Top it up directly at thelordofthepanels.com; NexaVerify
          has no way to fund it from here.
        </p>
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-4">Settings</h3>
        <SocialBoostConfigForm config={config} />
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-1">Catalog — markup, favorites &amp; enable/disable</h3>
        <p className="text-sm text-gray-400 dark:text-night-400 mb-4 max-w-2xl">
          Set a markup amount and save it to apply across the whole Social Boost catalog — it replaces
          each service's existing markup, so running it again with a new number updates all of them at once.
          Afterward, tweak any
          individual service's markup, favorite it (pins it to the top of its platform tab for
          customers), or disable it — all independently of the bulk action and of the global
          "Enabled" switch above.
        </p>
        <SocialBoostCatalogManager usdRate={usdRate} />
      </div>
    </div>
  );
}
