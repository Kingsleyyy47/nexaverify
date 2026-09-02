// Renders a logo that stays legible in both light and dark mode with no
// per-image setup from the admin, in either of two ways:
//
// 1. Automatic (default, no extra upload needed): the logo sits inside a
//    small neutral white backdrop chip, so a dark icon on a transparent
//    background never disappears into a dark page, and a white icon never
//    disappears into a light one — regardless of what color the source
//    image actually is. This is what "it should just work" means in
//    practice here: true pixel-level detection of an image's own background
//    color would need canvas pixel sampling, which breaks for most
//    externally-hosted logo URLs (no CORS headers on the image response =
//    a tainted, unreadable canvas) — since this app has no image-upload/
//    storage backend of its own (every logo is an admin-pasted external
//    URL), a fixed neutral backdrop is the approach that actually works for
//    any URL, every time, with zero configuration.
// 2. Manual override (optional `logoUrlDark`): an admin who wants pixel-
//    perfect control can still upload a purpose-made dark-mode version, and
//    it swaps in via Tailwind's `dark:` class variant (tracking the `dark`
//    class ThemeToggle.js toggles on <html> — no JS theme lookup, so it
//    can't fall out of sync with the actual toggle).
//
// `logo` is whatever usePlatformLogos().logoFor(name) or a category object
// gives back: { logoUrl, logoUrlDark } (logoUrlDark optional). Renders
// nothing if there's no logoUrl at all.
export default function AdaptiveLogo({ logo, className }) {
  if (!logo?.logoUrl) return null;

  if (logo.logoUrlDark) {
    return (
      <>
        <img src={logo.logoUrl} alt="" className={`${className} dark:hidden`} />
        <img src={logo.logoUrlDark} alt="" className={`${className} hidden dark:block`} />
      </>
    );
  }

  return (
    <span
      className={`${className} inline-flex items-center justify-center bg-white p-1 border border-gray-100 dark:border-night-700 overflow-hidden`}
    >
      <img src={logo.logoUrl} alt="" className="w-full h-full object-contain" />
    </span>
  );
}
