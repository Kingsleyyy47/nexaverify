import test from "node:test";
import assert from "node:assert/strict";
import { isSupportedSocialBoostService, canCancelSocialBoostOrder, extractSocialBoostCancelResult, readSocialBoostOrderResponse } from "../lib/socialboost-orders.mjs";

test("Social Boost offers only service types supported by the checkout fields", () => {
  assert.equal(isSupportedSocialBoostService({type:"Default"}), true);
  for (const type of ["Subscriptions", "Custom Comments", "Package", "Poll", undefined]) {
    assert.equal(isSupportedSocialBoostService({type}), false);
  }
});

test("Social Boost rejects missing order records and non-JSON failures without crashing history", async () => {
  for (const response of [Response.json({}), Response.json({order:null}), new Response("Server error", {status:500})]) {
    await assert.rejects(readSocialBoostOrderResponse(response, "Check history before retrying"), /Check history before retrying/);
  }
  await assert.rejects(readSocialBoostOrderResponse(Response.json({error:"Service unavailable"}, {status:503}), "Fallback"), /Service unavailable/);
});

test("Social Boost preserves an accepted order and its settlement warning", async () => {
  const data = {order:{id:"order"}, error:"Support must review settlement"};
  assert.deepEqual(await readSocialBoostOrderResponse(Response.json(data, {status:202}), "Fallback"), data);
});

test("Social Boost hides unavailable and already settled cancellation controls", () => {
  assert.equal(canCancelSocialBoostOrder({status:"Pending"}, {cancel:true}), true);
  for (const status of ["Completed", "Canceled", "Cancelled", "Partial"]) {
    assert.equal(canCancelSocialBoostOrder({status}, {cancel:true}), false);
  }
  assert.equal(canCancelSocialBoostOrder({status:"Pending"}, {cancel:false}), false);
  assert.equal(canCancelSocialBoostOrder({status:"Pending", cancel_requested_at:"now"}), false);
  assert.equal(canCancelSocialBoostOrder({status:"Pending", refunded_at:"now"}), false);
});

test("Social Boost cancellation results must belong to the requested provider order", () => {
  const results = [{order:41,cancel:1}, {order:42,cancel:{error:"Not available"}}];
  assert.deepEqual(extractSocialBoostCancelResult(results, "42"), {error:"Not available"});
  assert.equal(extractSocialBoostCancelResult(results, 43), undefined);
  assert.equal(extractSocialBoostCancelResult({order:41,cancel:1}, 42), undefined);
  assert.equal(extractSocialBoostCancelResult({orders:[{order:42,cancel:1}]}, 42), 1);
  assert.equal(extractSocialBoostCancelResult({cancel:1}, 42), 1);
  assert.equal(extractSocialBoostCancelResult(null, 42), undefined);
});
