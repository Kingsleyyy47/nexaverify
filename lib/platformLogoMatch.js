// No "server-only" — this is plain string matching, safe to import from
// either a Client Component (every buy list/form below) or a server route.
// Pairs with public.platform_logos (see schema.sql) and the admin CRUD at
// /admin/platform-logos: an admin sets a `platform_name` once (e.g.
// "TikTok", "WhatsApp") with a logo URL, and this function finds it inside
// any service/product name across the whole site — DaisySMS Products, US
// Only, International, Social Boost, Digital Accounts, and any future
// provider — with zero per-feature wiring beyond calling this.
//
// Picks the LONGEST matching platform_name when more than one matches (e.g.
// a service named "USA TIKTOK 100+ FOLLOWERS" would match both a generic
// "Instagram/TikTok" entry and a more specific "TikTok" entry if both
// existed — longest-match-wins prefers the more specific one, same principle
// as CSS specificity or greedy regex matching).
//
// Returns { logoUrl, logoUrlDark } (logoUrlDark possibly undefined) rather
// than a bare URL string, so callers can hand it straight to
// components/AdaptiveLogo.js for the automatic light/dark swap. Returns null
// when nothing matches.
export function matchPlatformLogo(text, logos) {
  if (!text || !Array.isArray(logos) || logos.length === 0) return null;
  const haystack = text.toLowerCase();

  let best = null;
  for (const logo of logos) {
    const name = (logo?.platformName || logo?.platform_name || "").trim();
    if (!name) continue;
    if (haystack.includes(name.toLowerCase()) && (!best || name.length > best.platformName.length)) {
      best = {
        platformName: name,
        logoUrl: logo.logoUrl || logo.logo_url,
        logoUrlDark: logo.logoUrlDark || logo.logo_url_dark || null,
      };
    }
  }
  if (!best?.logoUrl) return null;
  return { logoUrl: best.logoUrl, logoUrlDark: best.logoUrlDark };
}
