import test from "node:test";
import assert from "node:assert/strict";
import { extractJavaScriptAssets } from "../lib/live-assets.mjs";

const origin = "https://www.nexaverify.org";

test("deployment query strings and HTML-escaped parameters remain in asset probes", () => {
  const html = `<script src="/_next/static/chunks/app.js?dpl=dpl_example&amp;v=2"></script>
    <script async src='/_next/static/chunks/shared.js?dpl=dpl_example'></script>`;
  assert.deepEqual(extractJavaScriptAssets(html, origin), [
    origin + "/_next/static/chunks/app.js?dpl=dpl_example&v=2",
    origin + "/_next/static/chunks/shared.js?dpl=dpl_example",
  ]);
});

test("plain, absolute and duplicate script URLs resolve to unique static assets", () => {
  const path = "/_next/static/chunks/app.js";
  const html = `<script src="${path}"></script><script src="${origin}${path}#fragment"></script>
    <script data-src="/_next/static/chunks/not-requested.js"></script>
    <link rel="preload" href="/_next/static/chunks/not-a-script.js">`;
  assert.deepEqual(extractJavaScriptAssets(html, origin), [origin + path]);
});

test("asset probes exclude other hosts, non-static routes and invalid URLs", () => {
  const html = `<script src="https://other.example/_next/static/chunks/app.js"></script>
    <script src="/api/side-effect.js"></script><script src="/_next/static/css/styles.css"></script>
    <script src="http://[invalid"></script><script src="javascript:alert(1)"></script>`;
  assert.deepEqual(extractJavaScriptAssets(html, origin), []);
});
