import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
async function loadRoute(path, deps) {
  const key = randomUUID(); globalThis[key] = deps;
  let source = await fs.readFile(new URL(path, import.meta.url), "utf8");
  source = source.replace(/^import[\s\S]*?;\r?\n/gm, "");
  const names = Object.keys(deps);
  const shim = `const { ${names.join(", ")} } = globalThis[${JSON.stringify(key)}];\n`;
  return import("data:text/javascript;base64," + Buffer.from(shim + source).toString("base64"));
}
const NextResponse = { json(body, { status = 200 } = {}) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); } };
function topupDb() {
  const row = { id: "topup", status: "pending", user_id: "buyer", amount_ngn: 100 };
  return { row, from() {
    let patch, expected;
    return { update(values) { patch=values; return this; }, eq(col,value) { if(col === "status") expected=value; return this; }, select() { return this; },
      async maybeSingle() { if(row.status !== expected) return { data: null, error: null }; Object.assign(row,patch); return { data: {...row}, error:null }; },
      then(resolve,reject) { if(row.status === expected) Object.assign(row,patch); return Promise.resolve({error:null}).then(resolve,reject); } };
  } };
}
function deps(db, credit) { return { NextResponse, getSessionProfile: async () => ({ user: {id:"admin"}, profile: {id:"admin",role:"admin"} }), isAdmin: p => p?.role === "admin", createAdminClient: () => db, adjustBalance: credit, safeErrorResponse: async () => NextResponse.json({error:"unavailable"},{status:500}) }; }
const approve = () => new Request("https://example.test/api/admin/topups/review", { method:"POST", body: JSON.stringify({requestId:"topup",action:"approve"}) });
test("concurrent top-up approvals credit the wallet only once", async () => {
  const db=topupDb(); let credits=0;
  const route=await loadRoute("../app/api/admin/topups/review/route.js",deps(db,async () => {credits++;return 100;}));
  const responses=await Promise.all([route.POST(approve()),route.POST(approve())]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]); assert.equal(credits,1);
});
test("a failed wallet credit releases the approval for recovery", async () => {
  const db=topupDb(); const route=await loadRoute("../app/api/admin/topups/review/route.js",deps(db,async () => {throw new Error("offline");}));
  assert.equal((await route.POST(approve())).status,500); assert.equal(db.row.status,"pending");
});
test("unauthenticated admin approval cannot touch the database", async () => {
  const d=deps(null,()=>assert.fail("credit")); d.getSessionProfile=async()=>({user:null}); d.createAdminClient=()=>assert.fail("database");
  const route=await loadRoute("../app/api/admin/topups/review/route.js",d); assert.equal((await route.POST(approve())).status,403);
});

function statusDeps(db, provider) {
  const ErrorType=class extends Error {};
  return { NextResponse, getSessionProfile:async()=>({user:{id:"buyer"}}), createAdminClient:()=>db,
    getStatus:provider,checkSms:provider,checkSmsUsa:provider,checkStatusUsa:provider,
    DaisyError:ErrorType,DaisySimError:ErrorType,GetatextError:ErrorType,DaisySimUsaError:ErrorType,
    safeErrorResponse:async()=>NextResponse.json({error:"unavailable"},{status:500}),logError:async()=>"ERR-TEST" };
}
function statusDb(initial) {
  const row={...initial}; const db={row,sms:0,from(table) {
    let patch,filters=[];
    return { select(){return this;},eq(col,v){filters.push([col,v]);return this;},update(v){patch=v;return this;},
      async insert(){db.sms++;return {error:null};},async maybeSingle(){
        if(!filters.every(([col,v])=>row[col]===v))return {data:null,error:null};
        if(patch)Object.assign(row,patch);return {data:{...row},error:null};
      } };
  }};return db;
}
const statusRequest=()=>({nextUrl:new URL("https://example.test/api/rentals/status?id=rental")});
test("another customer's rental is never exposed or sent to the provider",async()=>{
  const db=statusDb({id:"rental",user_id:"other",status:"waiting"});
  const route=await loadRoute("../app/api/rentals/status/route.js",statusDeps(db,()=>assert.fail("provider call")));
  assert.equal((await route.GET(statusRequest())).status,404);
});
test("a late received-code poll cannot overwrite a concurrent cancellation",async()=>{
  const db=statusDb({id:"rental",user_id:"buyer",status:"waiting",provider:"daisysim"});
  const route=await loadRoute("../app/api/rentals/status/route.js",statusDeps(db,async()=>{db.row.status="cancelled";return {status:"received",code:"12345"};}));
  const response=await route.GET(statusRequest());assert.equal((await response.json()).rental.status,"cancelled");assert.equal(db.sms,0);
});
test("simultaneous status polls save received SMS history only once",async()=>{
  const db=statusDb({id:"rental",user_id:"buyer",status:"waiting",provider:"daisysim"});
  const route=await loadRoute("../app/api/rentals/status/route.js",statusDeps(db,async()=>({status:"received",code:"12345"})));
  const responses=await Promise.all([route.GET(statusRequest()),route.GET(statusRequest())]);assert.equal(db.sms,1);
  for(const r of responses)assert.equal((await r.json()).rental.status,"received");
});
