# Repository review — 2 October 2026

## Coverage

The baseline `bc4932b` contained 300 tracked files. The repository checker
reads every tracked file and new source file, parses all JavaScript,
TypeScript, JSON and CSS, resolves local import names with case sensitivity,
traces client imports for server-only dependencies, checks all 50 admin
route guards, checks SQL RLS patterns, and decodes all five PNG assets.
Generated dependencies, build output and local credentials are excluded.

These static checks were supplemented by source review of authentication,
admin/customer pricing, currency sync, catalogue pagination, wallet
adjustment and funding, rental ownership/state updates, digital-account
delivery, database functions/policies, cron, and frontend async state.
Static coverage is not a claim that every line received a manual review
or that all possible runtime failures have been eliminated.

## Confirmed issues addressed

- Signup fallback could replace an existing profile; duplicate IDs now leave
  that profile intact.
- Invalid JSON and primitive request bodies could crash API handlers. JSON
  object validation now covers 55 handlers, and switch values must be JSON
  booleans. Incomplete provider settings cannot disable every provider.
- Currency saves ignored database errors and could partially apply before
  finding an unavailable live rate. Validation precedes one bulk write.
- Currency sync could overwrite a concurrent manual rate. Conditional updates
  now check the current override at write time.
- Service sync combined manual and automatic price rows. Provider metadata
  writes now exclude customer prices; automatic price updates check the saved
  setting. Saving a manual price turns automatic pricing off.
- Several failed reads appeared as empty catalogues or zero admin counts.
  Those calls now propagate database errors. Catalogue/override reads and
  credential delivery no longer depend on an unpaged 1,000-row response.
- Digital orders use their complete transaction snapshot to return credentials
  after purchase, avoiding a failing/truncated second read after charging.
- Slow International requests could overwrite a newer country/service
  selection. Superseded responses are now ignored.
- Blocked browser storage could crash the theme toggle.
- Initial date rendering depended on server/browser time zones, causing
  hydration mismatches. Dates now use a stable initial render and switch to
  the visitor's local time after hydration.
- Duplicate bank and checkout notifications could report successful credit
  based only on a payment marker. They now require matching wallet evidence.
- Webhook logs could retain sensitive header values; these values are redacted.
- The schema's refund backfill treated cancellation as proof of refund. It
  now requires matching purchase/refund ledger totals for the same customer.
- Cron SQL contained a shared credential. The committed value was removed;
  jobs now read Supabase Vault, and cron authentication only accepts headers.

## Live completion — 3 October 2026

- Supabase management access verified for `nexaverify` (`gbujxsvsmtpyvmnsndhn`).
- Applied the service-only Vault validator and guarded refund-marker migration.
  The marker preview found zero eligible rows; no wallet balances were changed.
- Rotated the exposed credential to 64 random characters in Vault. Runtime
  validation has no environment fallback, and the old key returns HTTP 403.
- All four job commands now read Vault and use explicit 60-second timeouts.
  Service sync, backup, currency sync and a safe auth probe returned HTTP 200.
  Subsequent automatic timeout sweeps returned HTTP 200 with zero errors.
- 38 regression tests, production compilation, CI and public live checks passed.

## Remaining live work

- Reconcile the 23 historical settlement findings using provider statements
  and manual adjustment evidence. No historic balances were reset or credited.
- Wallet claim markers and wallet RPCs remain separate transactions. Process
  termination between them requires reconciliation until atomic settlement
  is migrated at the database layer.

## Ongoing checks

GitHub Actions runs repository checks, regression tests, dependency audit
and production compilation on pushes/PRs and twice daily. Public live checks
run on the schedule. The existing weekly Codex reliability review continues.
See [reliability checks](./reliability-checks.md) for commands and limitations.

## Weekly review — 12 October 2026

- Repository and production remain on the reviewed main history; no intervening
  source changes were found. All 306 repository files passed static checks.
- 38 regression tests passed before and after the patch. Production compilation
  succeeded for all 129 routes. Authenticated checks covered 40 customer/admin
  routes, 50 JavaScript assets, and catalogue APIs without paid test orders.
- Updated Next.js from 15.5.26 to 15.5.27; the production dependency audit
  reports zero vulnerabilities. The upstream advisories concern self-hosted
  SSG/ISR caching; the publisher states Vercel deployments are unaffected.
  Sources: [upstream advisory one](https://github.com/vercel/next.js/security/advisories/GHSA-4jqv-mc3x-m676),
  [upstream advisory two](https://github.com/vercel/next.js/security/advisories/GHSA-mcj8-r9mp-w47p).
- Full dependency audit still reports five high and two moderate advisories
  through development-only Tailwind 3 dependencies. The registry still lists
  braces 3.0.3 as its latest version; npm proposes a major Tailwind 4 migration.
  These build-tool findings remain open for a compatible fix or separately
  verified migration.
- Read-only settlement scan covered 7,189 transactions, 2,457 rentals,
  31 Telegram orders, 407 Social Boost orders, 1,750 payment records and
  two top-up requests. Its 23 findings exactly match the 2 October baseline:
  21 refund markers without linked credits, one deposit mismatch and one
  excess refund. No new or resolved findings; no historical credits issued.
- The saved Supabase management access token returns HTTP 401. Service-role
  access still supports the settlement audit, but current cron job metadata
  and transport results could not be inspected through management access.

## Weekly review — 19 October 2026

- Fixed a monitoring false alarm introduced by deployment query parameters
  on Next.js script URLs. The live checker now parses script sources, keeps
  query parameters, decodes escaped ampersands, deduplicates asset URLs and
  limits probes to this origin under `/_next/static/`. Preload links and
  `data-src` attributes are excluded.
- Added three regression cases covering queried/escaped URLs, plain/absolute
  duplicates, and invalid, non-static or cross-origin sources. All 41 tests
  passed; repository checks covered 308 files, and the production build
  completed for all 129 routes.
- Authenticated verification returned HTTP 200 for 40 customer/admin routes,
  50 script assets, and catalogue APIs. Public checks cover 10 login scripts
  and unauthenticated private-page redirects.
- Production dependency audit remains clean. The full dependency audit still
  reports five high and two moderate findings through development-only
  Tailwind 3 dependencies, with a major Tailwind 4 migration proposed.
- Read-only settlement audit covered 7,942 transactions, 2,677 rentals,
  31 Telegram orders, 407 Social Boost orders, 2,014 payment records and
  two top-up requests. All 23 findings match the 12 October baseline;
  no new or resolved discrepancies. No paid test orders or historical
  wallet adjustments were made.
- Supabase management access still returns HTTP 401 (invalid access token).
  A replacement token is needed to inspect current cron metadata and
  transport results. The service-role settlement audit continues to work.

## Social Boost repair — 24 October 2026

- Reproduced a live checkout HTTP 500 using an empty, non-purchasing request.
  The checkout referenced `profileError` without reading it from the session;
  every authenticated purchase failed before validation. The catalogue loaded
  9,892 services and the provider balance endpoint confirmed USD funds.
- Fixed the session lookup and added regressions for global/admin custom
  pricing, one wallet debit, and account lookup failures. Customer checkout
  now offers only standard services supported by its link/quantity fields;
  subscription, package and custom-input types remain in the admin catalogue
  and are rejected before any provider purchase.
- Validated successful order responses before updating history; malformed
  responses no longer insert undefined orders. Refresh/cancel failures and
  accepted-order settlement warnings are visible outside the purchase form.
  Unavailable or settled cancellation controls are hidden.
- Cancellation responses must confirm the requested provider order. Pending
  cancellation requests and invalid remaining quantities cannot trigger a
  refund. Confirmed final cancellations refund only the undelivered portion;
  completed delivery gets no refund. Uncertain cases require support review,
  including accepted cancellations whose provider status remains pending.
  Historical orders and balances were not modified; paid provider actions
  were tested with mocks.
- The dependency audit identified new upstream advisories on Next.js 15.5.27.
  Updated to the publisher's patched 15.5.28 release:
  [image optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
  [Server Actions advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r).
- All 54 regression tests pass, including 13 new Social Boost cases. Repository
  checks cover 310 files. The production dependency audit reports zero
  vulnerabilities after the patch. Production compilation completed for all
  129 routes.
