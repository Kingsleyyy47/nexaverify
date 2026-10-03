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
