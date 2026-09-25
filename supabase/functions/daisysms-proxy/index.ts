// Transparent reverse proxy for DaisySMS handler_api.php.
//
// Why this exists: DaisySMS is behind Cloudflare, which serves a challenge
// page to Vercel's shared serverless IP ranges. Calling the same endpoint from
// Supabase's network works, so the Next.js app (lib/daisy.js) sends its
// request here when DAISYSMS_PROXY_URL is set, and this function makes the
// real call to DaisySMS from Supabase's egress IPs.
//
// It forwards the query string unchanged and sends no spoofed headers. The
// response comes back as is: status, body, and the X-Text / X-Price headers
// DaisySMS uses.
//
// Auth: a shared secret in the x-proxy-secret header, checked against the
// DAISYSMS_PROXY_SECRET function secret. This is NOT Supabase JWT auth, so
// deploy with JWT verification off:
//   supabase functions deploy daisysms-proxy --no-verify-jwt
//   supabase secrets set DAISYSMS_PROXY_SECRET=<long random value>

const UPSTREAM = Deno.env.get("DAISYSMS_UPSTREAM_URL") ?? "https://daisysms.io/stubs/handler_api.php";
const PROXY_SECRET = Deno.env.get("DAISYSMS_PROXY_SECRET") ?? "";

// Only the actions lib/daisy.js actually uses, so a leaked secret cannot turn
// this into an open relay for arbitrary DaisySMS calls.
const ALLOWED_ACTIONS = new Set([
  "getBalance",
  "getNumber",
  "getStatus",
  "setStatus",
  "getExtraActivation",
  "getPricesVerification",
  "getPrices",
  "keep",
  "setAutoRenew",
]);

const MAX_QUERY_LENGTH = 2048;
const UPSTREAM_TIMEOUT_MS = 24_000;

const encoder = new TextEncoder();

// Constant-time comparison: hash both values to a fixed length, then XOR every
// byte so timing does not reveal how much of the secret matched.
async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function plain(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return plain(405, "METHOD_NOT_ALLOWED");

  if (!PROXY_SECRET) return plain(500, "PROXY_NOT_CONFIGURED");
  const provided = req.headers.get("x-proxy-secret") ?? "";
  if (!(await secretsMatch(provided, PROXY_SECRET))) return plain(401, "UNAUTHORIZED");

  const incoming = new URL(req.url);
  if (incoming.search.length > MAX_QUERY_LENGTH) return plain(414, "QUERY_TOO_LONG");

  const action = incoming.searchParams.get("action") ?? "";
  if (!ALLOWED_ACTIONS.has(action)) return plain(400, "BAD_ACTION");

  const target = new URL(UPSTREAM);
  target.search = incoming.search;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    // Plain request, no custom headers.
    const upstream = await fetch(target.toString(), { method: "GET", signal: controller.signal });
    const body = await upstream.arrayBuffer();

    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    for (const name of ["x-text", "x-price"]) {
      const value = upstream.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    return new Response(body, { status: upstream.status, headers });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "AbortError";
    return plain(timedOut ? 504 : 502, timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNREACHABLE");
  } finally {
    clearTimeout(timer);
  }
});
