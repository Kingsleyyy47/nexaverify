import "server-only";

// Fetches live USD/GBP/EUR -> NGN exchange rates from a free, keyless public
// API (https://www.exchangerate-api.com/docs/free — the "open" endpoint
// needs no signup, no API key, and has no billing to ever fail on). Rates
// refresh roughly once every 24h on their end; we call this from a button
// click or a pg_cron job every few hours, which is plenty.
//
// Deliberately keyless: this is a "live rate" convenience feature, not a
// billing-critical dependency — see lib/ltr-sync.js and currency_rates'
// manual_override column, which let an admin always override with a fixed
// number if this ever becomes unavailable. Nothing else in NexaVerify
// depends on this succeeding.
const LIVE_RATE_URL = "https://open.er-api.com/v6/latest/USD";

export async function fetchLiveNgnRates() {
  const res = await fetch(LIVE_RATE_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Exchange rate API returned HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.result !== "success" || !data.rates) {
    throw new Error("Exchange rate API returned an unexpected response");
  }

  const { NGN, USD, GBP, EUR } = data.rates;
  if (!NGN || !USD || !GBP || !EUR) {
    throw new Error("Exchange rate API response is missing NGN/USD/GBP/EUR");
  }

  // data.rates is USD-based (rates.X = units of X per 1 USD). Convert each
  // to "how many Naira for 1 unit of this currency" — the same shape
  // currency_rates.ngn_per_unit already uses everywhere else in the app.
  return {
    USD: NGN, // 1 USD = NGN naira, directly
    GBP: NGN / GBP, // 1 GBP = (NGN per USD) / (GBP per USD) naira
    EUR: NGN / EUR,
    fetchedAt: data.time_last_update_utc || new Date().toISOString(),
  };
}
