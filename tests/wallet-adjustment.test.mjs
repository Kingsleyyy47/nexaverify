import test from "node:test";
import assert from "node:assert/strict";
import { adjustBalance } from "../lib/wallet-adjustment.mjs";
const args = { p_user_id: "buyer", p_type: "purchase", p_amount: -25.127, p_reference_id: "order" };
function client({ ledger = [], result = { data: 74.87, error: null }, committed = null, ledgerError = null } = {}) {
  const calls = [];
  return { calls, async rpc(name, params) { calls.push({ name, params }); return result; }, from() {
    const query = { select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; }, limit() { return this; },
      then(resolve, reject) { return Promise.resolve({ data: ledger, error: ledgerError }).then(resolve, reject); },
      async maybeSingle() { return { data: committed, error: null }; } };
    return query;
  } };
}
test("wallet debits round to kobo and return a confirmed balance", async () => {
  const db = client(); assert.equal(await adjustBalance(db, args), 74.87);
  assert.equal(db.calls[0].params.p_amount, -25.13);
});
test("Supabase returned errors are thrown; the debit is never retried", async () => {
  const db = client({ result: { data: null, error: { message: "Insufficient balance", code: "P0001" } } });
  await assert.rejects(adjustBalance(db, args), { code: "P0001" }); assert.equal(db.calls.length, 1);
});
test("an uncertain response is reconciled against its exact committed ledger entry", async () => {
  const db = client({ result: { data: null, error: { message: "connection lost" } }, committed: { balance_after: 74.87 } });
  assert.equal(await adjustBalance(db, args), 74.87); assert.equal(db.calls.length, 1);
});
test("non-finite, zero, wrong-sign and sub-kobo amounts cannot reach the RPC", async () => {
  for (const amount of [NaN, Infinity, 0, 1, -0.001]) {
    const db = client(); await assert.rejects(adjustBalance(db, { ...args, p_amount: amount })); assert.equal(db.calls.length, 0);
  }
});
test("an unpaid order cannot create a refund", async () => {
  const db = client(); await assert.rejects(adjustBalance(db, { ...args, p_type: "refund", p_amount: 25 }), { code: "REFUND_EXCEEDS_PURCHASE" }); assert.equal(db.calls.length, 0);
});
test("refund cannot exceed the original customer's debit", async () => {
  const db = client({ ledger: [{ type: "purchase", amount: -25 }] });
  await assert.rejects(adjustBalance(db, { ...args, p_type: "refund", p_amount: 26 })); assert.equal(db.calls.length, 0);
});
test("a repeated full or partial refund is settled without a second credit", async () => {
  for (const amount of [25, 10]) {
    const db = client({ ledger: [{ type: "purchase", amount: -25 }, { type: "refund", amount, balance_after: 90 }] });
    assert.equal(await adjustBalance(db, { ...args, p_type: "refund", p_amount: amount }), 90); assert.equal(db.calls.length, 0);
  }
});
test("failure to read refund evidence blocks the credit", async () => {
  const db = client({ ledgerError: { message: "database offline" } }); await assert.rejects(adjustBalance(db, { ...args, p_type: "refund", p_amount: 25 }), /database offline/); assert.equal(db.calls.length, 0);
});

test("a payment recovery with an existing deposit cannot credit it again", async () => {
  const db = client({ committed: { balance_after: 100 } });
  assert.equal(await adjustBalance(db, { ...args, p_type: "deposit", p_amount: 25 }),100);
  assert.equal(db.calls.length,0);
});
