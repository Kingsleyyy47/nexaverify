// Single source of truth for the "no code within N minutes -> auto-cancel +
// refund" rule (Kingsley's rule) — imported by both the server-side sweep
// (app/api/admin/rentals/sweep-timeouts) and the client-side countdown shown
// on NumberCard.js, so the number the customer sees counting down can never
// drift out of sync with what actually triggers the auto-cancel. No
// "server-only" import — this file is plain data, safe for either side.
export const RENTAL_TIMEOUT_MINUTES = 3;
