// PAUSED (2026-07-31): this used to be a "Sync LTRs from DaisySMS" button.
// DaisySMS has no working list/expiry-check endpoint for this account (see
// lib/ltr-sync.js and app/api/admin/rentals/sync-ltrs/route.js for the full
// story), so the sync button has been replaced with a plain notice rather
// than a control that would call a paused, always-no-op endpoint. Track and
// renew long-term rentals manually using the table below until a working
// DaisySMS endpoint exists.
export default function SyncLtrsButton() {
  return (
    <span className="badge badge-warning">
      Auto-sync paused — manage long-term rentals manually below
    </span>
  );
}
