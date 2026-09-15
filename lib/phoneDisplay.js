// Defensive display-time guard for anywhere a rental's phone_number is shown
// to a customer. lib/daisy.js now validates a provider's response shape
// before ever writing to rentals.phone_number (see its Sept 2026 incident
// comment — a Cloudflare/WAF block page got parsed as a real
// ACCESS_NUMBER response and stored as a customer's "phone number"), but
// this is the belt-and-suspenders half: any already-corrupted historical row,
// or a future bug in a different provider wrapper, still can't render raw
// garbage on a customer-facing screen — it renders as "—" instead.
const PHONE_RE = /^\+?\d{6,15}$/;

export function safePhoneNumber(value) {
  const v = String(value || "").trim();
  return PHONE_RE.test(v) ? v : "—";
}
