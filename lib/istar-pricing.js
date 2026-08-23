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

// Two markup PROFILES are kept fully configured side by side ("Old way" and
// "New way" — this labeling stuck from earlier iterations, but both are now
// just independently configurable profiles, neither locked to one
// calculation). Each profile has its OWN operator:
//
//   'times': order total = (base cost per star + markup) x quantity
//   'plus':  order total = (base cost per star x quantity) + markup
//
// This exists because the business owner wanted to change the calculation
// on either profile independently, without the other profile's numbers or
// operator being affected — see TelegramPremiumConfigForm.js.
//
// Both profiles pick their under/over-1000 markup by the REQUESTED QUANTITY
// on that specific order: qty < 1000 vs qty >= 1000.

function getBaseCostPerStar(config) {
  const hasLearnedCost = config.starLastCostNgn != null && Number(config.starLastCostNgn) > 0;
  return hasLearnedCost ? Number(config.starLastCostNgn) : Number(config.ngnPerStar || 0);
}

// Computes a total given an explicit operator and markup pair — the
// lowest-level building block, used by both computeStarTotalPriceForWay
// (below) and directly by anything that already knows which operator/markup
// it wants without going through the "old way"/"new way" naming.
export function computeStarTotalForOperator(config, quantity, operator, markupUnder1000, markupOver1000) {
  const baseCostPerStar = getBaseCostPerStar(config);
  const qty = Number(quantity) || 0;
  const markup = qty >= 1000 ? Number(markupOver1000 || 0) : Number(markupUnder1000 || 0);
  const total = operator === "times" ? (baseCostPerStar + markup) * qty : baseCostPerStar * qty + markup;
  return Math.max(0, Math.round(total * 100) / 100);
}

// Computes the total for ONE specific profile ('old' or 'new'), regardless
// of which profile is actually live — used to show both side by side in
// admin so the owner can compare them before picking one.
//
// `config` is { ngnPerStar, starLastCostNgn, oldWayOperator,
// oldWayMarkupUnder1000, oldWayMarkupOver1000, newWayOperator,
// newWayMarkupUnder1000, newWayMarkupOver1000 }.
export function computeStarTotalPriceForWay(config, quantity, way) {
  const operator = way === "old" ? config.oldWayOperator : config.newWayOperator;
  const markupUnder1000 = way === "old" ? config.oldWayMarkupUnder1000 : config.newWayMarkupUnder1000;
  const markupOver1000 = way === "old" ? config.oldWayMarkupOver1000 : config.newWayMarkupOver1000;
  return computeStarTotalForOperator(config, quantity, operator === "times" ? "times" : "plus", markupUnder1000, markupOver1000);
}

// The one actually charged — dispatches to whichever profile
// `config.activeWay` says is live ('old' or 'new', defaulting to 'new' if
// unset/unrecognized). This is what the buy route and the buy form's live
// price displays should call.
export function computeStarTotalPrice(config, quantity) {
  const way = config.activeWay === "old" ? "old" : "new";
  return computeStarTotalPriceForWay(config, quantity, way);
}

// Maps a raw istar_config DB row (snake_case columns) to the camelCase shape
// every function above expects — kept in one place so the buy route, the
// admin page, and the customer page can't drift out of sync on field names.
// Accepts either a full row (select("*")) or a partial one with just the
// star_* / ngn_per_star columns selected.
export function starConfigFromRow(row) {
  return {
    ngnPerStar: row?.ngn_per_star,
    starLastCostNgn: row?.star_last_cost_ngn,
    activeWay: row?.star_pricing_mode === "per_star" ? "old" : "new",
    oldWayOperator: row?.star_old_way_operator === "plus" ? "plus" : "times",
    oldWayMarkupUnder1000: row?.star_markup_under_1000_ngn,
    oldWayMarkupOver1000: row?.star_markup_1000_plus_ngn,
    newWayOperator: row?.star_new_way_operator === "times" ? "times" : "plus",
    newWayMarkupUnder1000: row?.star_flat_markup_under_1000_ngn,
    newWayMarkupOver1000: row?.star_flat_markup_1000_plus_ngn,
  };
}
