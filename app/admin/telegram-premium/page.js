import { createAdminClient } from "@/lib/supabase/admin";
import { getWalletBalance, getPremiumPackages, buildPremiumPricing, IStarError } from "@/lib/istar";
import TelegramPremiumConfigForm from "@/components/TelegramPremiumConfigForm";

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
    starMarkupUnder1000Ngn: row?.star_markup_under_1000_ngn ?? 0,
    starMarkupOver1000Ngn: row?.star_markup_1000_plus_ngn ?? 0,
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
          iStar has no live pre-purchase price for stars — the "cost" column fills in automatically
          the first time a star order actually completes, paid from the USDT wallet. Markup is
          tiered by the REQUESTED QUANTITY on each order: under 1,000 stars gets one markup, 1,000+
          gets a different one. Total for an order = quantity x the matching row's "Customer pays."
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 border-b border-gray-100 dark:border-night-700">
                <th className="pb-2.5 font-bold">Quantity tier</th>
                <th className="pb-2.5 font-bold">Learned cost (₦/star)</th>
                <th className="pb-2.5 font-bold">Your markup (₦/star)</th>
                <th className="pb-2.5 font-bold">Customer pays (₦/star)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-night-800">
              {[
                { label: "Under 1,000 stars", markup: config.starMarkupUnder1000Ngn },
                { label: "1,000+ stars", markup: config.starMarkupOver1000Ngn },
              ].map((tier) => {
                const baseCost = config.starLastCostNgn ? Number(config.starLastCostNgn) : Number(config.ngnPerStar || 0);
                return (
                  <tr key={tier.label}>
                    <td className="py-2.5 pr-3 font-semibold dark:text-night-100">{tier.label}</td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-night-300">
                      {config.starLastCostNgn
                        ? `₦${baseCost.toFixed(4)}`
                        : `₦${baseCost.toFixed(4)} (starting price guess)`}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-night-300">
                      ₦{Number(tier.markup || 0).toFixed(4)}
                    </td>
                    <td className="py-2.5 pr-3 font-bold text-brand-700 dark:text-brand-400">
                      ₦{(baseCost + Number(tier.markup || 0)).toFixed(4)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
