// Deterministic gradient assignment for a Digital Accounts category banner
// (components/DigitalAccountsBrowser.js, components/LogsQuickList.js) — per
// the business owner's reference screenshot, each category gets its own
// solid color banner (purple for one, blue for another, etc.) rather than a
// plain gray header. Categories are admin-created with no color field of
// their own, so instead of requiring one, the same category id always hashes
// to the same entry in this fixed palette — consistent across the full
// browse page, the dashboard's Logs preview, and repeat visits, without any
// extra admin setup.
const BANNER_GRADIENTS = [
  "from-purple-600 to-indigo-600",
  "from-blue-600 to-cyan-500",
  "from-orange-500 to-amber-500",
  "from-emerald-600 to-teal-500",
  "from-pink-600 to-rose-500",
  "from-sky-600 to-blue-500",
  "from-red-600 to-orange-500",
  "from-indigo-600 to-purple-500",
  "from-teal-600 to-emerald-500",
  "from-fuchsia-600 to-pink-500",
];

export function categoryBannerGradient(key) {
  const s = String(key || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return BANNER_GRADIENTS[hash % BANNER_GRADIENTS.length];
}
