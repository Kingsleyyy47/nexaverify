import test from "node:test";
import assert from "node:assert/strict";
import { fetchAllRows, fetchRowsInChunks } from "../lib/pagination.mjs";
import { recoverChunkError } from "../lib/chunkRecovery.mjs";
test("a 3527-row catalog is fetched completely with fresh ordered pages", async () => {
  const all = Array.from({ length: 3527 }, (_, id) => ({ id })); let builds = 0;
  const rows = await fetchAllRows(() => { builds++; return { order(column) { assert.equal(column, "id"); return this; }, async range(a, b) { return { data: all.slice(a,b+1), error: null }; } }; }, "id");
  assert.deepEqual(rows, all); assert.equal(builds, 4);
});
test("a failed page cannot become a successful truncated catalog or backup", async () => {
  let page = 0;
  await assert.rejects(fetchAllRows(() => ({ order() { return this; }, async range() { return page++ ? { error: new Error("offline") } : { data: Array(1000).fill({ id: 1 }) }; } }), "id"), /offline/);
});
test("chunked override lookup stops on database errors", async () => {
  await assert.rejects(fetchRowsInChunks([1,2], async () => ({ error: new Error("denied") })), /denied/);
});
test("chunk errors reload once; render errors do not; blocked storage cannot loop", () => {
  const values = new Map(); let reloads = 0;
  const browser = { sessionStorage: { getItem(k) { return values.get(k) ?? null; }, setItem(k,v) { values.set(k,v); } }, location: { reload() { reloads++; } } };
  const error = new Error("Loading chunk 5488 failed. (timeout)");
  assert.equal(recoverChunkError(error, browser, 1000), true);
  assert.equal(recoverChunkError(error, browser, 1001), false);
  assert.equal(recoverChunkError(new Error("render failed"), browser, 70000), false);
  assert.equal(recoverChunkError(error, { ...browser, sessionStorage: { getItem() { throw new Error("blocked"); } } }, 70000), false);
  assert.equal(reloads, 1);
});
