# Reliability checks

## Checks before deployment

- `npm test`: regression cases for wallet error propagation, uncertain RPC responses, refund limits, duplicate approvals, ownership, concurrent status updates, pricing, pagination, and chunk recovery.
- `npm audit --omit=dev --audit-level=high`: dependency vulnerabilities.
- `npm run build`: production compilation of all routes.
- `npm run check:live`: read-only production login/assets/version and private-route protection.
- `npm run audit:settlements`: read-only database reconciliation using the local server environment. Exits nonzero on records requiring review. Never edits balances.

GitHub Actions runs tests, audit, and build on pushes and pull requests. Twice daily it also checks the public live site. Dependabot checks npm dependencies weekly. These checks can detect regressions and outages; they cannot guarantee that third-party providers never fail.

## Money and account rules

- Authenticate with Supabase Auth before using the server client, and explicitly scope every customer lookup to the verified user ID.
- Supabase database calls return errors instead of necessarily throwing. Inspect the error or use throwOnError; never infer success from an awaited query alone.
- Keep the wallet ledger in NGN. Apply admin pricing/markups on the server. Currency selection changes only the display.
- A refund needs an original purchase debit owned by the same account and reference. A failed purchase cannot create refund credit.
- Do not blindly retry money mutations after timeouts. Reconcile against the matching ledger entry first.
- Claims and wallet RPCs currently use separate database transactions. A process termination between them still requires reconciliation. Full atomic settlement needs a database migration and verified management access; the read-only audit detects the gap.
- Provider purchases and database debits are separate systems. An accepted order with a failed debit requires support reconciliation. Do not encourage customers to place the order again.

## Historical review, 2 October 2026

A read-only scan covered 5,833 wallet transactions, 2,028 rentals, 28 Telegram orders, 407 Social Boost orders, 1,347 payment records, and two manual top-up requests. It found 23 historical settlement discrepancies. Several have unlinked manual adjustments or explicit provider refund denials. A completed marker alone is not sufficient evidence to issue another credit. Detailed references are recorded privately in Admin Notifications and the local review file; no production balances were changed by this scan.

## Verification limits

Regression tests exercise provider/database failure paths with mocks. Live checks verify actual authentication, account/admin data, prices, and access controls without placing paid provider orders. Provider billing and historical credit corrections require independent settlement evidence.
