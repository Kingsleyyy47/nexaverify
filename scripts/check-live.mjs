import assert from "node:assert/strict";
const origin = process.env.LIVE_SITE_URL || "https://www.nexaverify.org";
async function request(path, options = {}) {
  return fetch(new URL(path, origin), { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(30000), ...options });
}
const version = await request("/api/build-version");
assert.equal(version.status, 200, "Build version endpoint failed");
assert.ok((await version.json()).version, "Missing deployment version");
const login = await request("/login"); assert.equal(login.status, 200, "Login page failed");
const html = await login.text();
const assets = [...new Set([...html.matchAll(/src="([^" ]*\/_next\/static\/[^" ]+\.js)"/g)].map(m => m[1]))];
assert.ok(assets.length, "Login page has no JavaScript assets");
const results = await Promise.allSettled(assets.map(async src => { const res = await request(src, { method: "HEAD" }); assert.equal(res.status, 200, "Missing asset: " + src); }));
for (const result of results) if (result.status === "rejected") throw result.reason;
for (const path of ["/dashboard", "/admin", "/rentals", "/history", "/wallet"]) {
  const res = await request(path); assert.ok([302,303,307,308].includes(res.status), "Unauthenticated private page must redirect: " + path);
  assert.equal(new URL(res.headers.get("location"), origin).pathname, "/login");
}
console.log("Live checks passed: deployment version, login, " + assets.length + " assets, and private-page protection.");
