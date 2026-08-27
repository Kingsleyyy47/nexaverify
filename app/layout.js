import "./globals.css";
import VersionWatcher from "@/components/VersionWatcher";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.nexaverify.org";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "NexaVerify",
    template: "%s · NexaVerify",
  },
  description: "Buy verification phone numbers instantly.",
  // Favicon/apple touch icon are picked up automatically from app/icon.png
  // and app/apple-icon.png via Next.js's file-based icon convention — no
  // metadata.icons entry needed. Same for the social preview image, via
  // app/opengraph-image.png (used for both openGraph and twitter cards).
  openGraph: {
    title: "NexaVerify",
    description: "Buy verification phone numbers instantly.",
    url: SITE_URL,
    siteName: "NexaVerify",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NexaVerify",
    description: "Buy verification phone numbers instantly.",
  },
};

// Without this, mobile browsers render the page at a wide virtual viewport
// (~980px, desktop-sized) and zoom the whole thing out to fit the physical
// screen — which is exactly why "hidden md:flex" sidebars showed up
// squished-but-visible on real phones instead of actually hiding: the phone
// never gets below Tailwind's 768px `md` breakpoint in the first place.
export const viewport = {
  width: "device-width",
  initialScale: 1,
};

// Sets the `dark` class on <html> before the page paints, based on the
// visitor's saved preference. Light is always the default — dark only ever
// turns on if the visitor previously tapped the toggle (we never infer it
// from the OS/browser color-scheme). Runs inline and blocking, on purpose,
// so there's no flash of the wrong theme on load — this can't be a normal
// useEffect because that would run after first paint. Since the choice is
// stored in localStorage (not a cookie or session value), it survives
// closing the tab/browser and stays until the visitor taps the icon again.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    if (window.localStorage.getItem("nexa-theme") === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
})();
`;

// Stamps the build id this exact page was rendered with onto `window`, so
// components/VersionWatcher.js has something to compare against when it
// later polls /api/build-version for whatever's currently live. Evaluated
// server-side per request, so it always reflects the deployment that
// actually served this page — never stale, regardless of caching elsewhere.
const VERSION_STAMP_SCRIPT = `window.__NEXA_BUILD_ID__ = ${JSON.stringify(
  process.env.NEXT_PUBLIC_BUILD_ID || "dev"
)};`;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: VERSION_STAMP_SCRIPT }} />
      </head>
      <body>
        {children}
        <VersionWatcher />
      </body>
    </html>
  );
}
