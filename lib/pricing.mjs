export function computeNgnPrice(usdPrice, usdRate, markupNgn = 0) {
  const cost = Number(usdPrice), rate = Number(usdRate), markup = Number(markupNgn ?? 0);
  if (![cost, rate, markup].every(Number.isFinite) || cost <= 0 || rate <= 0 || markup < 0) return null;
  const total = Math.round((cost * rate + markup) * 100) / 100;
  return Number.isFinite(total) && total > 0 && total <= 9_999_999_999.99 ? total : null;
}
