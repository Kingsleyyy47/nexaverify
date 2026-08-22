// Pure pricing math shared between server (API routes, admin/customer pages)
// and the client (TelegramGiftBuyForm, for live per-preset price display).
// Deliberately has NO "server-only" import and does no I/O — lib/istar.js is
// server-only (reads ISTAR_API_KEY, makes network calls) and re-exports this
// for server-side callers, but the buy form needs to call this directly from
// the browser to show a live total under each quantity preset.

// Star gifting has no live pre-purchase price at all — unlike premium, there
// isn't even a per-quantity-tier endpoint from iStar. The only way to ever
// learn the real per-star cost is to look at what a completed order actually
// charged (see lib/istar.js#learnStarCostFromOrder), which is why
// istar_config carries a self-learning `star_last_cost_ngn` alongside the
// static `ngn_per_star` fallback.
//
// `config` is { ngnPerStar, starLastCostNgn, flatMarkupUnder1000, flatMarkupOver1000 }.
// `quantity` is the number of stars in THIS purchase.
//
// The markup is a FLAT amount added ONCE to the whole order — NOT a per-star
// margin multiplied by quantity. Which flat amount applies is picked by the
// REQUESTED QUANTITY: quantity >= 1000 uses flatMarkupOver1000, otherwise
// flatMarkupUnder1000. So the total is:
//   (base cost per star x quantity) + flat markup for that tier
// Base cost per star is the learned real cost once one exists, otherwise the
// admin's starting-price guess (ngnPerStar) — never dropped silently.
export function computeStarTotalPrice(config, quantity) {
  const hasLearnedCost = config.starLastCostNgn != null && Number(config.starLastCostNgn) > 0;
  const baseCostPerStar = hasLearnedCost ? Number(config.starLastCostNgn) : Number(config.ngnPerStar || 0);
  const qty = Number(quantity) || 0;
  const flatMarkup = qty >= 1000 ? Number(config.flatMarkupOver1000 || 0) : Number(config.flatMarkupUnder1000 || 0);
  const total = baseCostPerStar * qty + flatMarkup;
  return Math.max(0, Math.round(total * 100) / 100);
}
