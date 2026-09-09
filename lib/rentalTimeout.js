// The "no code within N minutes -> auto-cancel + refund" rule (Kingsley's
// rule) — split into two deliberately DIFFERENT numbers per Kingsley's
// explicit request:
//   - RENTAL_TIMEOUT_MINUTES: what the customer sees counting down on
//     NumberCard.js ("Auto-cancels & refunds in mm:ss"). Shorter, so the
//     number doesn't feel like it's sitting forever — but the customer can
//     always hit "Cancel" manually themselves at any time regardless of this
//     countdown (see app/api/rentals/cancel), so nothing actually breaks
//     when this display timer runs out before the real backend one does.
//   - RENTAL_BACKEND_TIMEOUT_MINUTES: the real threshold the server-side
//     sweep (app/api/admin/rentals/sweep-timeouts) enforces before it
//     auto-cancels and refunds a rental on its own, unprompted. Kept longer
//     to give slower SMS providers/routes more room to actually deliver a
//     code before NexaVerify gives up on their behalf.
// No "server-only" import — this file is plain data, safe for either side.
export const RENTAL_TIMEOUT_MINUTES = 7;
export const RENTAL_BACKEND_TIMEOUT_MINUTES = 15;
