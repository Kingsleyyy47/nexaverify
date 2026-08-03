// Shared nav lockup: icon mark + "nexaverify" wordmark beside it + tagline
// beneath the name. Unlike the full lockup PNG (public/logo/nexaverify-lockup.png,
// still used on the login page's colored right panel), the wordmark and
// tagline here are live text with dark: variants — legible on both the
// plain-white nav backgrounds (MarketingHeader, sidebars) and dark ones,
// which the flat-white-text PNG asset can't do. Only the icon-only mark
// image is used, since that one's already confirmed to read on both.
export default function NavLogo() {
  return (
    <span className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/nexaverify-mark.png" alt="" className="h-7 md:h-8 w-auto shrink-0" />
      <span className="leading-tight">
        <span className="block font-extrabold text-base md:text-lg text-brand-900 dark:text-night-100">
          nexa<span className="text-brand-600 dark:text-brand-400">verify</span>
        </span>
        <span className="block font-bold tracking-widest uppercase text-[8px] md:text-[9px] text-gray-400 dark:text-night-500">
          Verify. Trust. Nexa.
        </span>
      </span>
    </span>
  );
}
