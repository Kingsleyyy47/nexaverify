import { createAdminClient } from "@/lib/supabase/admin";
import { getWalletBalance, getPremiumPackages, buildPremiumPricing, IStarError } from "@/lib/istar";
import { computeStarTotalPriceForWay } from "@/lib/istar-pricing";
import TelegramPremiumConfigForm from "@/components/TelegramPremiumConfigForm";

// Example quantities used purely to illustrate each tier's math below — any
// quantity < 1000 lands in the first row, any >= 1000 in the second; these
// two numbers aren't special beyond being representative.
const EXAMPLE_QTY_UNDER_1000 = 100;
const EXAMPLE_QTY_OVER_1000 = 1500;

export default async function AdminTelegramPremiumPage() {
  const admin = createAdminClient();

  const [{ data: row }, { data: usdRateRow }] = await Promise.all([
    admin.from("istar_config").select("*").eq("id", true).maybeSingle(),
    admin.from("currency_rates").select("ngn_per_unit").eq("currency", "USD").maybeSingle(),
  ]);

  const config = {
    enabled: Boolean(row?.enabled),
    customerVisible: Boolean(row?.customer_visible),
    ngnPerStar: row?.ngn_per_star ?? 0,
    starPricingMode: row?.star_pricing_mode === "per_star" ? "per_star" : "flat",
    starOldWayOperator: row?.star_old_way_operator === "plus" ? "plus" : "times",
    starNewWayOperator: row?.star_new_way_operator === "times" ? "times" : "plus",
    starMarkupUnder1000Ngn: row?.star_markup_under_1000_ngn ?? 0,
    starMarkupOver1000Ngn: row?.star_markup_1000_plus_ngn ?? 0,
    starFlatMarkupUnder1000Ngn: row?.star_flat_markup_under_1000_ngn ?? 0,
    starFlatMarkupOver1000Ngn: row?.star_flat_markup_1000_plus_ngn ?? 0,
    starLastCostNgn: row?.star_last_cost_ngn ?? null,
    starLastCostWalletType: row?.star_last_cost_wallet_type ?? null,
    starLastCostUpdatedAt: row?.star_last_cost_updated_at ?? null,
    starLearnLastAttemptAt: row?.star_learn_last_attempt_at ?? null,
    starLearnLastStatus: row?.star_learn_last_status ?? null,
    starLearnLastRawAmount: row?.star_learn_last_raw_amount ?? null,
    starLearnLastRawQuantity: row?.star_learn_last_raw_quantity ?? null,
    starLearnLastWalletType: row?.star_learn_last_wallet_type ?? null,
    starLearnLastNote: row?.star_learn_last_note ?? null,
    premiumMarkup3: row?.premium_markup_3 ?? 0,
    premiumMarkup6: row?.premium_markup_6 ?? 0,
    premiumMarkup12: row?.premium_markup_12 ?? 0,
    updatedAt: row?.updated_at ?? null,
  };

  // Best-effort — a missing/invalid ISTAR_API_KEY shouldn't take down the
  // whole settings page, just the wallet balance display. USDT only, on
  // purpose: it's the wallet actually in use, and the only one self-learning
  // pricing can reliably convert to Naira (see star_last_cost_ngn below).
  let usdtWallet = null;
  let usdtWalletError = "";
  try {
    usdtWallet = await getWalletBalance("USDT");
  } catch (err) {
    usdtWalletError = err instanceof IStarError ? err.message : "Could not load USDT balance.";
  }

  // Live cost per duration, fetched fresh every page load, so the admin
  // always sees exactly what iStar is charging right now before deciding on
  // a markup — the same numbers the buy route re-fetches at purchase time.
  const usdRate = usdRateRow ? Number(usdRateRow.ngn_per_unit) : null;
  let premiumPricing = { 3: null, 6: null, 12: null };
  let pricingError = "";
  try {
    const packages = await getPremiumPackages();
    premiumPricing = buildPremiumPricing(packages, usdRate, {
      3: config.premiumMarkup3,
      6: config.premiumMarkup6,
      12: config.premiumMarkup12,
    });
  } catch (err) {
    pricingError = err instanceof IStarError ? err.message : "Could not load live package pricing.";
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">Telegram Premium &amp; Stars</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          Telegram Stars and Telegram Premium gifting, billed from the site's own iStar TON/USDT
          wallet — not a customer's NGN balance is what actually pays iStar, but customers still
          pay in NGN out of their wallet here, same as every other product — always funded from the
          USDT wallet specifically (the only currency self-learning pricing can convert to Naira).
          Two separate switches below: "Enabled" is your own test-ordering access, always available
          to you as admin; "Let customers see it" is a second, off-by-default switch that opens the
          real buy flow to everyone else too.
        </p>
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-1">iStar wallet balance (USDT)</h3>
        {usdtWalletError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{usdtWalletError}</p>
        ) : (
          <p className="text-lg font-bold text-gray-900 dark:text-night-50">
            {usdtWallet ? `${usdtWallet.balance} ${usdtWallet.currency || "USDT"}` : "—"}
          </p>
        )}
        <p className="text-sm text-gray-500 dark:text-night-300 mt-2">
          This is what funds every star/premium order. Top it up directly in the iStar dashboard;
          NexaVerify has no way to fund it from here.
        </p>
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-1">What you're charged (Stars)</h3>
        <p className="text-xs text-gray-400 dark:text-night-400 mb-4 max-w-lg">
          iStar has no live pre-purchase price for stars — "cost per star" fills in automatically
          the first time a star order actually completes, paid from the USDT wallet. Two markup
          styles are kept configured side by side below so you can compare them — only ONE is
          actually charged to buyers at a time, picked by "Pricing mode" in Settings below
          (currently{" "}
          <span className="font-semibold text-gray-600 dark:text-night-200">
            {config.starPricingMode === "per_star" ? "Old way" : "New way"}
          </span>
          ). The example rows show a {EXAMPLE_QTY_UNDER_1000}-star and a{" "}
          {EXAMPLE_QTY_OVER_1000}-star order just to illustrate the math — any quantity in that tier
          works the same way.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          {[
            {
              key: "old",
              modeValue: "per_star",
              title: "Old way",
              operator: config.starOldWayOperator,
              markupUnder: config.starMarkupUnder1000Ngn,
              markupOver: config.starMarkupOver1000Ngn,
            },
            {
              key: "new",
              modeValue: "flat",
              title: "New way",
              operator: config.starNewWayOperator,
              markupUnder: config.starFlatMarkupUnder1000Ngn,
              markupOver: config.starFlatMarkupOver1000Ngn,
            },
          ].map((profile) => {
            const isActive = config.starPricingMode === profile.modeValue;
            const isTimes = profile.operator === "times";
            const desc = isTimes
              ? "(cost per star + markup) × quantity"
              : "(cost per star × quantity) + markup";
            return (
              <div
                key={profile.key}
                className={`rounded-lg border p-3 ${
                  isActive
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
                    : "border-gray-200 dark:border-night-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm">
                    {profile.title} <span className="text-gray-400 dark:text-night-400 font-normal">({isTimes ? "×" : "+"})</span>
                  </span>
                  {isActive && <span className="badge badge-success text-[10px]">Active</span>}
                </div>
                <p className="text-xs text-gray-400 dark:text-night-400 mb-3 font-mono">{desc}</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 dark:text-night-400 border-b border-gray-100 dark:border-night-700">
                      <th className="pb-1.5 font-bold">Example</th>
                      <th className="pb-1.5 font-bold">Markup</th>
                      <th className="pb-1.5 font-bold">Total (₦)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-night-800">
                    {[
                      { label: `${EXAMPLE_QTY_UNDER_1000} stars`, qty: EXAMPLE_QTY_UNDER_1000, markup: profile.markupUnder },
                      { label: `${EXAMPLE_QTY_OVER_1000.toLocaleString()} stars`, qty: EXAMPLE_QTY_OVER_1000, markup: profile.markupOver },
                    ].map((row) => {
                      const total = computeStarTotalPriceForWay(
                        {
                          ngnPerStar: config.ngnPerStar,
                          starLastCostNgn: config.starLastCostNgn,
                          oldWayOperator: config.starOldWayOperator,
                          oldWayMarkupUnder1000: config.starMarkupUnder1000Ngn,
                          oldWayMarkupOver1000: config.starMarkupOver1000Ngn,
                          newWayOperator: config.starNewWayOperator,
                          newWayMarkupUnder1000: config.starFlatMarkupUnder1000Ngn,
                          newWayMarkupOver1000: config.starFlatMarkupOver1000Ngn,
                        },
                        row.qty,
                        profile.key
                      );
                      return (
                        <tr key={row.label}>
                          <td className="py-1.5 pr-2 font-semibold dark:text-night-100">{row.label}</td>
                          <td className="py-1.5 pr-2 text-gray-500 dark:text-night-300">
                            {isTimes ? "×" : "+"} ₦{Number(row.markup || 0).toFixed(2)}
                          </td>
                          <td className="py-1.5 pr-2 font-bold text-brand-700 dark:text-brand-400">
                            ₦{total.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
        {!config.starLastCostNgn && (
          <p className="text-xs text-gray-400 dark:text-night-400 mt-3">
            Cost per star above is still the starting-price guess (₦{Number(config.ngnPerStar || 0).toFixed(2)}) —
            it'll switch to a learned real cost after the first completed USDT star order.
          </p>
        )}
        {config.starLastCostNgn && (
          <p className="text-xs text-gray-400 dark:text-night-400 mt-3">
            Learned from your last completed {config.starLastCostWalletType} order,{" "}
            {config.starLastCostUpdatedAt ? new Date(config.starLastCostUpdatedAt).toLocaleString() : "recently"}.
          </p>
        )}

        {config.starLearnLastAttemptAt && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-night-800">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-2">
              Last learning attempt (every completed star order, success or not)
            </h4>
            <div className="text-xs text-gray-500 dark:text-night-300 space-y-1">
              <p>
                <span className="font-semibold">When:</span>{" "}
                {new Date(config.starLearnLastAttemptAt).toLocaleString()}
              </p>
              <p>
                <span className="font-semibold">Result:</span>{" "}
                <span
                  className={
                    config.starLearnLastStatus === "learned"
                      ? "text-brand-700 dark:text-brand-400 font-semibold"
                      : "text-amber-600 dark:text-amber-400 font-semibold"
                  }
                >
                  {config.starLearnLastStatus || "unknown"}
                </span>
              </p>
              <p>
                <span className="font-semibold">Raw from provider:</span>{" "}
                {config.starLearnLastRawAmount ?? "—"} {config.starLearnLastWalletType || ""} for{" "}
                {config.starLearnLastRawQuantity ?? "—"} stars
              </p>
              {config.starLearnLastNote && (
                <p className="text-amber-600 dark:text-amber-400">{config.starLearnLastNote}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-1">What iStar charges (Premium)</h3>
        <p className="text-xs text-gray-400 dark:text-night-400 mb-4 max-w-lg">
          Live cost, in Naira, re-fetched from iStar every time this page loads — the same numbers
          the buy route re-fetches at the moment of purchase. Your markup below is a flat NGN amount
          added on top, not a percentage.
        </p>
        {pricingError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{pricingError}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 border-b border-gray-100 dark:border-night-700">
                  <th className="pb-2.5 font-bold">Duration</th>
                  <th className="pb-2.5 font-bold">iStar charges (₦)</th>
                  <th className="pb-2.5 font-bold">Your markup (₦)</th>
                  <th className="pb-2.5 font-bold">Customer pays (₦)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-night-800">
                {[3, 6, 12].map((m) => {
                  const live = premiumPricing[m];
                  return (
                    <tr key={m}>
                      <td className="py-2.5 pr-3 font-semibold dark:text-night-100">{m} months</td>
                      <td className="py-2.5 pr-3 text-gray-500 dark:text-night-300">
                        {live ? `₦${live.costNgn.toLocaleString()}` : "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-500 dark:text-night-300">
                        {live ? `₦${live.markupNgn.toLocaleString()}` : "—"}
                      </td>
                      <td className="py-2.5 pr-3 font-bold text-brand-700 dark:text-brand-400">
                        {live ? `₦${live.priceNgn.toLocaleString()}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-4">Settings</h3>
        <TelegramPremiumConfigForm config={config} livePricing={premiumPricing} />
      </div>
    </div>
  );
}
