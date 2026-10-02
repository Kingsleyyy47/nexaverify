import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { readObjectBody } from "../lib/request-body.mjs";
async function loadRoute(path, deps) {
  deps = { readObjectBody, ...deps };
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

test("a reference-less bank webhook cannot generate a duplicateable wallet credit", async () => {
  const d={createAdminClient:()=>assert.fail("database"),adjustBalance:()=>assert.fail("credit"),
    logError:async()=>"ERR-REFERENCE",confirmPayment:async()=>{},isSuccessfulStatus:()=>false,isFailedStatus:()=>false,PocketfiError:class extends Error {}};
  const route=await loadRoute("../lib/wallet-funding.js",d);
  const result=await route.creditVirtualAccountFromWebhook({accountNumber:"1234567890",amountNgn:100});
  assert.equal(result.outcome,"insert_failed");assert.equal(result.referenceId,"ERR-REFERENCE");
});

test("invalid login JSON and non-string usernames cannot reach authentication or the database", async () => {
  const route = await loadRoute("../app/api/auth/login/route.js", {
    NextResponse, createAdminClient: () => assert.fail("database"), createClient: () => assert.fail("auth"), escapeLikePattern: () => assert.fail("username lookup"),
  });
  for (const body of ["{", "null", "[]", JSON.stringify({ username: {}, password: "secret" })]) {
    assert.equal((await route.POST(new Request("https://example.test/api/auth/login", { method: "POST", body }))).status, 400);
  }
});

test("an incomplete provider-switch request cannot turn every provider off", async () => {
  const route=await loadRoute("../app/api/admin/providers/config/route.js",{NextResponse,...adminAuth,createAdminClient:()=>assert.fail("database")});
  for(const body of [{},{daisysmsEnabled:"false"}]) assert.equal((await route.POST({json:async()=>body})).status,400);
});

test("signup cannot overwrite a profile already created by the auth trigger", async () => {
  const row = { id: "existing", username: "original", email: "original@example.test", balance: 123 };
  const db = { from() { return { select() { return this; }, ilike() { return this; }, maybeSingle: async () => ({ data: null, error: null }),
    async upsert(values, options) { if (!options.ignoreDuplicates) Object.assign(row, values); return { error: null }; } }; } };
  const route = await loadRoute("../app/api/auth/signup/route.js", {
    NextResponse, createAdminClient: () => db, escapeLikePattern: v => v, isValidUsername: () => true, USERNAME_RULES_MESSAGE: "invalid",
    createClient: async () => ({ auth: { signUp: async () => ({ data: { user: { id: "existing" } }, error: null }) } }),
  });
  const response = await route.POST({ json: async () => ({ username: "replacement", email: "other@example.test", password: "secret" }), nextUrl: new URL("https://example.test") });
  assert.equal(response.status, 200);
  assert.equal(row.username, "original"); assert.equal(row.email, "original@example.test"); assert.equal(row.balance, 123);
});

function ratesDb({ fail = false, race = false } = {}) {
  const rows = new Map(["USD", "GBP", "EUR"].map(currency => [currency, { currency, ngn_per_unit: 100, auto_ngn_per_unit: 100, manual_override: false }]));
  let writes = 0;
  return { rows, get writes() { return writes; }, from() {
    let patch, filters = [], selected = false;
    return { select() { selected = true; return this; }, eq(k, v) { filters.push([k,v]); return this; },
      update(v) { patch=v; return this; }, async upsert(values, options) {
        writes++; if(fail) return {error:{message:"offline"}};
        for(const v of Array.isArray(values)?values:[values]) if(!options.ignoreDuplicates||!rows.has(v.currency)) Object.assign(rows.get(v.currency),v);
        return {error:null};
      }, then(resolve, reject) {
        if(patch && race && patch.ngn_per_unit && filters.some(([k,v])=>k==="currency"&&v==="USD")) {
          Object.assign(rows.get("USD"),{manual_override:true,ngn_per_unit:7777}); race=false;
        }
        const matches=[...rows.values()].filter(r=>filters.every(([k,v])=>r[k]===v));
        if(patch){writes++;if(!fail)matches.forEach(r=>Object.assign(r,patch));}
        return Promise.resolve({data:selected?matches:null,error:fail?{message:"offline"}:null}).then(resolve,reject);
      } };
  } };
}
const adminAuth = { getSessionProfile: async () => ({ user: { id: "admin" }, profile: { role: "admin" } }), isAdmin: p => p?.role === "admin" };
test("currency sync preserves a manual rate saved during the sync", async () => {
  const db=ratesDb({race:true});
  const route=await loadRoute("../app/api/admin/currency-rates/sync/route.js", {NextResponse,...adminAuth,createAdminClient:()=>db,isAuthorizedCron:()=>true,fetchLiveNgnRates:async()=>({USD:1500,GBP:1900,EUR:1650})});
  assert.equal((await route.POST({})).status,200);
  assert.equal(db.rows.get("USD").ngn_per_unit,7777); assert.equal(db.rows.get("USD").auto_ngn_per_unit,1500); assert.equal(db.rows.get("GBP").ngn_per_unit,1900);
});
test("failed currency writes cannot report success", async () => {
  const db=ratesDb({fail:true});
  const route=await loadRoute("../app/api/admin/currency-rates/sync/route.js", {NextResponse,...adminAuth,createAdminClient:()=>db,isAuthorizedCron:()=>true,fetchLiveNgnRates:async()=>({USD:1500,GBP:1900,EUR:1650})});
  assert.equal((await route.POST({})).status,503);
});
test("missing live rates are validated before any custom currencies are changed", async () => {
  const db=ratesDb();db.rows.get("EUR").auto_ngn_per_unit=null;
  const route=await loadRoute("../app/api/admin/currency-rates/route.js",{NextResponse,...adminAuth,createAdminClient:()=>db});
  const response=await route.POST({json:async()=>({USD:{mode:"custom",value:3000},GBP:{mode:"custom",value:4000},EUR:{mode:"live"}})});
  assert.equal(response.status,400);assert.equal(db.writes,0);assert.equal(db.rows.get("USD").ngn_per_unit,100);
});

test("service sync preserves manual prices alongside automatic products",async()=>{
  const rows=[{id:"manual",name:"Manual",auto_markup:false,markup_amount:null,customer_price:2500}, {id:"auto",name:"Auto",auto_markup:true,markup_amount:100,customer_price:1000}];
  const batches=[];
  const db={from(table){let patch,filters=[];return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},maybeSingle:async()=>({data:{ngn_per_unit:1500},error:null}),
    async upsert(values){batches.push(values);for(const v of values)Object.assign(rows.find(r=>r.id===v.id),v);return {error:null};},update(v){patch=v;return this;},
    then(resolve,reject){rows.filter(r=>filters.every(([k,v])=>r[k]===v)).forEach(r=>Object.assign(r,patch));return Promise.resolve({error:null}).then(resolve,reject);}};}};
  const route=await loadRoute("../app/api/admin/services/sync/route.js",{NextResponse,...adminAuth,createAdminClient:()=>db,isAuthorizedCron:()=>true,
    getPricesVerification:async()=>({manual:{cost:0.5,count:10},auto:{cost:0.2,count:5}}),fetchAllRows:async()=>rows.map(r=>({...r}))});
  assert.equal((await route.POST({})).status,200);assert.equal(rows[0].customer_price,2500);assert.equal(rows[1].customer_price,400);
  assert.ok(batches.every(batch=>batch.every(r=>!("customer_price" in r))));
});

test("a duplicate bank transfer is acknowledged only when its matching wallet credit exists", async () => {
  for(const credited of [false,true]) {
    const db={from(table){let inserting=false;return {select(){return this;},eq(){return this;},or(){return this;},limit(){return this;},
      insert(){inserting=true;return this;},
      async maybeSingle(){if(inserting)return {data:null,error:{code:"23505"}};return table==="payment_transactions"?{data:{id:"payment",user_id:"buyer",amount_ngn:100},error:null}:{data:credited?{id:"credit"}:null,error:null};},
      then(resolve,reject){return Promise.resolve({data:[{user_id:"buyer",account_number:"1234567890"}],error:null}).then(resolve,reject);}};}};
    const route=await loadRoute("../lib/wallet-funding.js",{createAdminClient:()=>db,adjustBalance:()=>assert.fail("blind duplicate credit"),
      logError:async()=>"ERR-LEDGER",confirmPayment:async()=>{},isSuccessfulStatus:()=>false,isFailedStatus:()=>false,PocketfiError:class extends Error {}});
    const result=await route.creditVirtualAccountFromWebhook({accountNumber:"1234567890",reference:"transfer",amountNgn:100});
    assert.equal(result.outcome,credited?"already_processed":"credit_failed");
  }
});


test("completed checkout markers require a matching wallet credit before reporting success", async () => {
  for (const credited of [false,true]) {
    const db = { from(table) { const query = { select() {return this;}, eq() {return this;}, limit() {return this;},
      maybeSingle() {return this;}, throwOnError:async()=>({data:table === "payment_transactions"
        ? {id:"payment",user_id:"buyer",status:"completed",amount_ngn:100,confirmed_amount_ngn:100}
        : credited ? {id:"credit"} : null}) }; return query; } };
    const route=await loadRoute("../lib/wallet-funding.js",{createAdminClient:()=>db,adjustBalance:()=>assert.fail("blind duplicate credit"),
      logError:async()=>"ERR-LEDGER",confirmPayment:()=>assert.fail("provider"),isSuccessfulStatus:()=>false,isFailedStatus:()=>false,PocketfiError:class extends Error {}});
    const result=await route.confirmAndCreditPocketfiPayment("checkout",{userId:"buyer"});
    assert.equal(result.outcome,credited?"already_processed":"pending");
    if(!credited)assert.equal(result.referenceId,"ERR-LEDGER");
  }
});
