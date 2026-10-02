import test from "node:test";
import assert from "node:assert/strict";
import { auditSettlements } from "../lib/settlement-audit.mjs";
const row = { id:"order",user_id:"buyer",created_at:"2020-01-01",price:100 };
const tx = (type,amount) => ({user_id:"buyer",reference_id:"order",type,amount});
test("claimed but uncredited refunds and deposits are detected",()=>{
  assert.equal(auditSettlements({rentals:[{...row,refunded_at:"2020-01-01"}],transactions:[tx("purchase",-100)]}).length,1);
  assert.equal(auditSettlements({payment_transactions:[{...row,status:"completed",amount_ngn:100}],transactions:[]}).length,1);
});
test("correct settlements pass and another account's ledger cannot hide a missing credit",()=>{
  const tables={rentals:[{...row,refunded_at:"2020-01-01"}],transactions:[tx("purchase",-100),tx("refund",100)]};
  assert.deepEqual(auditSettlements(tables),[]);tables.transactions[1].user_id="other";assert.equal(auditSettlements(tables).length,1);
});
test("in-flight operations are excluded from reconciliation alerts",()=>{
  assert.deepEqual(auditSettlements({topup_requests:[{...row,status:"approved",amount_ngn:100,reviewed_at:new Date().toISOString()}]}),[]);
});
