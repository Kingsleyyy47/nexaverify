// Read-only diagnostics endpoint for the PocketFi virtual-account webhook
// matching problem (see lib/wallet-funding.js's creditVirtualAccountFromWebhook
// and app/api/pocketfi/webhook/route.js). When a customer says "I deposited
// but my wallet never updated," the fastest way to tell what actually
// happened is to look at pocketfi_webhook_events + payment_transactions +
// virtual_accounts together, without ever handing the real
// SUPABASE_SERVICE_ROLE_KEY to whoever (or whatever) is doing the diagnosis.
//
// This function holds the service role key itself (Supabase auto-injects
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY into every Edge Function's
// environment — nothing to set manually there) and is gated by its own
// narrow, single-purpose secret instead, same pattern as
// supabase/functions/daisysms-proxy. That secret can be rotated or handed to
// a support tool without ever touching the real database credential.
//
// Deploy:
//   supabase functions deploy pocketfi-diagnostics --no-verify-jwt
//   supabase secrets set POCKETFI_DIAGNOSTICS_SECRET=<long random value>
//
// Call:
//   curl -H "x-diagnostics-secret: $POCKETFI_DIAGNOSTICS_SECRET" \
//     "https://<project-ref>.supabase.co/functions/v1/pocketfi-diagnostics?limit=10"
//
// Optional query params:
//   limit        - rows per table, default 10, max 50
//   user_id      - if set, also filters payment_transactions/virtual_accounts
//                  to that one customer
//   account_number - if set, returns only the virtual account matching this
//                  number (exact or digits-only) plus its owner's recent
//                  payment_transactions, which is normally the fastest way
//                  in: start from the account number the customer sent money
//                  to, not from the webhook log.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DIAGNOSTICS_SECRET = Deno.env.get("POCKETFI_DIAGNOSTICS_SECRET") ?? "";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const encoder = new TextEncoder();

// Constant-time comparison, same approach as daisysms-proxy: hash both
// values to a fixed length, then compare every byte, so response timing
// never reveals how much of the secret matched.
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

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return json(405, { error: "METHOD_NOT_ALLOWED" });

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(500, { error: "SUPABASE_ENV_MISSING" });
  if (!DIAGNOSTICS_SECRET) return json(500, { error: "DIAGNOSTICS_NOT_CONFIGURED" });

  const provided = req.headers.get("x-diagnostics-secret") ?? "";
  if (!(await secretsMatch(provided, DIAGNOSTICS_SECRET))) return json(401, { error: "UNAUTHORIZED" });

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;
  const userId = url.searchParams.get("user_id");
  const accountNumber = url.searchParams.get("account_number");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Starting point: the account number the customer actually sent money to.
  // This resolves it to a user_id up front, which the payment_transactions
  // and webhook_events sections below then use, so the whole response is
  // scoped to one customer's deposit instead of a generic recent-activity
  // dump.
  let scopedUserId = userId;
  let virtualAccount: Record<string, unknown> | null = null;
  if (accountNumber && !scopedUserId) {
    const { data: accounts, error } = await admin
      .from("virtual_accounts")
      .select("user_id, provider, bank, account_number, account_name, created_at")
      .eq("provider", "pocketfi");
    if (error) return json(502, { error: "QUERY_FAILED", detail: error.message });
    const wanted = digitsOnly(accountNumber);
    const match = (accounts ?? []).find(
      (a) => a.account_number === accountNumber || digitsOnly(a.account_number) === wanted
    );
    if (match) {
      virtualAccount = match;
      scopedUserId = match.user_id;
    }
  }

  const [webhookEventsRes, paymentTransactionsRes, virtualAccountsRes] = await Promise.all([
    admin
      .from("pocketfi_webhook_events")
      .select("id, signature_valid, matched_payment_id, matched_user_id, payload, received_at")
      .order("received_at", { ascending: false })
      .limit(limit),
    (() => {
      let q = admin
        .from("payment_transactions")
        .select("id, user_id, provider, payment_id, client_ref, amount_ngn, confirmed_amount_ngn, status, created_at, completed_at")
        .in("provider", ["pocketfi", "pocketfi_virtual_account"])
        .order("created_at", { ascending: false })
        .limit(limit);
      if (scopedUserId) q = q.eq("user_id", scopedUserId);
      return q;
    })(),
    scopedUserId
      ? admin
          .from("virtual_accounts")
          .select("user_id, provider, bank, account_number, account_name, created_at")
          .eq("provider", "pocketfi")
          .eq("user_id", scopedUserId)
      : admin
          .from("virtual_accounts")
          .select("user_id, provider, bank, account_number, account_name, created_at")
          .eq("provider", "pocketfi")
          .order("created_at", { ascending: false })
          .limit(limit),
  ]);

  if (webhookEventsRes.error) return json(502, { error: "QUERY_FAILED", detail: webhookEventsRes.error.message });
  if (paymentTransactionsRes.error) return json(502, { error: "QUERY_FAILED", detail: paymentTransactionsRes.error.message });
  if (virtualAccountsRes.error) return json(502, { error: "QUERY_FAILED", detail: virtualAccountsRes.error.message });

  return json(200, {
    scoped_user_id: scopedUserId,
    matched_virtual_account: virtualAccount,
    // Webhook events aren't filtered by user (the whole point of this table
    // is that an unmatched event has no user_id yet), but each row's payload
    // is included so you can eyeball whether one of them carries the
    // scoped account number under a field name creditVirtualAccountFromWebhook
    // isn't currently checking.
    webhook_events: webhookEventsRes.data,
    payment_transactions: paymentTransactionsRes.data,
    virtual_accounts: virtualAccountsRes.data,
  });
});
