// Pure pricing math shared between server (API routes, admin/customer pages)
// and the client (TelegramGiftBuyForm, for live per-preset price display).
// Deliberately has NO "server-only" import and does no I/O — lib/istar.js is
// server-only (reads ISTAR_API_KEY, makes network calls) and re-exports this
// for server-side callers, but the buy form needs to call this directly from
// the browser to show a live price under each quantity preset, since the
// markup now depends on the REQUESTED QUANTITY, not just a single flat rate.

// Star gifting has no live pre-purchase price at all — unlike premium, there
// isn't even a per-quantity-tier endpoint from iStar. The only way to ever
// learn the real cost is to look at what a completed order actually charged
// (see lib/istar.js#learnStarCostFromOrder), which is why istar_config
// carries a self-learning `star_last_cost_ngn` alongside the static
// `ngn_per_star` fallback. This decides which of the two is the base cost.
//
// `config` is { ngnPerStar, starLastCostNgn, markupUnder1000, markupOver1000 }.
// `quantity` is the number of stars being priced for THIS purchase — the
// markup tier is picked per-order based on it: quantity >= 1000 uses
// markupOver1000, otherwise markupUnder1000. Lets a bulk buyer be margined
// differently from a small one, per admin's request.
//
// Returns the price for a SINGLE star, in NGN — multiply by quantity for the
// total. Always ADDS the markup on top of the base cost — never multiplies,
// and never drops the markup silently (a previous version of this function
// did exactly that whenever no learned cost existed yet — fixed for good).
export function computeStarPricePerUnit(config, quantity) {
  const hasLearnedCost = config.starLastCostNgn != null && Number(config.starLastCostNgn) > 0;
  const baseCost = hasLearnedCost ? Number(config.starLastCostNgn) : Number(config.ngnPerStar || 0);
  const qty = Number(quantity) || 0;
  const markup = qty >= 1000 ? Number(config.markupOver1000 || 0) : Number(config.markupUnder1000 || 0);
  return Math.round((baseCost + markup) * 10000) / 10000;
}
