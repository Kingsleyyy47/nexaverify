// Currency display helpers. NGN is always the real ledger currency — every
// balance, price, and charge in the database is in Naira. Everything in this
// file is purely cosmetic: converting a NGN amount into what to *show* a
// customer who picked a different display currency at the top of the page.
// No plain JS/server split needed here, so it's safe to import from both
// Server and Client Components.

export const CURRENCIES = ["NGN", "USD", "GBP", "EUR"];

export const CURRENCY_SYMBOLS = {
  NGN: "₦",
  USD: "$",
  GBP: "£",
  EUR: "€",
};

// Turns the rows from public.currency_rates into { USD: 1500, GBP: 1900, ... }.
// NGN is always 1 (it's the base currency).
export function ratesToMap(rates) {
  const map = { NGN: 1 };
  for (const r of rates || []) {
    map[r.currency] = Number(r.ngn_per_unit);
  }
  return map;
}

// Converts an amount stored in NGN into the target display currency.
// Falls back to the raw NGN amount if no rate has been set yet for that
// currency, rather than showing something misleading like 0.
export function convertFromNgn(amountNgn, targetCurrency, rateMap) {
  const amount = Number(amountNgn) || 0;
  if (targetCurrency === "NGN") return amount;
  const rate = rateMap?.[targetCurrency];
  if (!rate) return amount;
  return amount / rate;
}

export function formatMoney(amount, currency) {
  const symbol = CURRENCY_SYMBOLS[currency] || "";
  // Locale pinned to "en-US" rather than left as `undefined` (the visitor's
  // own browser locale) — this value is rendered by Client Components using
  // data that's already present at server-render time (e.g. WalletBalanceCard
  // showing the balance passed down from a Server Component), so the server
  // and the browser must produce byte-identical text or React throws a
  // hydration mismatch (errors #418/#423/#425) the instant a visitor's
  // browser locale formats numbers differently than the server's default.
  const formatted = Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

// Convenience: convert an NGN amount straight to a formatted display string.
export function formatFromNgn(amountNgn, targetCurrency, rateMap) {
  return formatMoney(convertFromNgn(amountNgn, targetCurrency, rateMap), targetCurrency);
}
