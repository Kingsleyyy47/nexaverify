"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { CURRENCIES, ratesToMap, convertFromNgn, formatMoney } from "@/lib/currency";

const CurrencyContext = createContext(null);

const STORAGE_KEY = "nexa-currency";

// Wraps the customer app so any page/component can read the visitor's chosen
// display currency and convert/format NGN amounts into it. `rates` comes
// from public.currency_rates, fetched server-side once in the layout.
export function CurrencyProvider({ rates, children }) {
  const rateMap = useMemo(() => ratesToMap(rates), [rates]);
  const [currency, setCurrencyState] = useState("NGN");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    setCurrencyState(CURRENCIES.includes(saved) && (saved === "NGN" || rateMap[saved]) ? saved : "NGN");
  }, [rateMap]);

  function setCurrency(next) {
    if (!CURRENCIES.includes(next) || (next !== "NGN" && !rateMap[next])) return;
    setCurrencyState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  const value = useMemo(
    () => ({
      currency,
      setCurrency,
      rateMap,
      convert: (ngnAmount) => convertFromNgn(ngnAmount, currency, rateMap),
      format: (ngnAmount) => formatMoney(convertFromNgn(ngnAmount, currency, rateMap), currency),
    }),
    [currency, rateMap]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used inside a <CurrencyProvider>");
  return ctx;
}
