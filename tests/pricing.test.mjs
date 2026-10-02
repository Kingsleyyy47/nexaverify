import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { computeNgnPrice } from "../lib/pricing.mjs";
const currency = await import("data:text/javascript;base64," + Buffer.from(await fs.readFile(new URL("../lib/currency.js", import.meta.url), "utf8")).toString("base64"));
test("admin markup is applied in NGN and zero overrides remain zero", () => {
  assert.equal(computeNgnPrice(1.05,1500,300),1875);
  assert.equal(computeNgnPrice(1.05,1500,0),1575);
  assert.equal(computeNgnPrice(0.371,1500,123.45),679.95);
});
test("invalid provider price or exchange rate never becomes a usable quote", () => {
  for(const args of [[Infinity,1500,1],[1,0,1],[0,1500,100],[1,NaN,1],[1,1500,-1]]) assert.equal(computeNgnPrice(...args),null);
});
test("NGN converts before formatting; missing rates never relabel the original amount", () => {
  const rates=currency.ratesToMap([{currency:"USD",ngn_per_unit:1500},{currency:"GBP",ngn_per_unit:2000}]);
  assert.equal(currency.convertFromNgn(10699,"USD",rates),10699/1500);
  assert.equal(currency.formatFromNgn(10699,"USD",rates),"$7.13");
  assert.equal(currency.formatFromNgn(10699,"EUR",rates),"—");
});
