// One value per running deployment: Vercel sets VERCEL_GIT_COMMIT_SHA at
// build time automatically, so on Vercel this changes on every push with no
// extra setup. Off Vercel it falls back to the moment this config was
// evaluated (server start), which still changes on every fresh deploy/restart
// — the only edge case is a serverless cold start on the SAME deployment
// getting a "new" timestamp, which just causes one harmless extra reload.
// Read by app/api/build-version (server, always current) and inlined into
// the initial HTML by app/layout.js (see NEXT_PUBLIC_BUILD_ID below) so
// components/VersionWatcher.js can tell "the version I loaded with" apart
// from "the version currently being served" and force a refresh when they
// no longer match — this is what makes a push show up for open tabs without
// anyone needing to manually hard-refresh (ctrl+shift+r).
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_ID || String(Date.now());

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  // Without this, Next.js's client-side Router Cache keeps serving whatever
  // RSC payload a dynamic page (like /admin/products) had the FIRST time it
  // was visited in a session — so leaving the page and coming back via a
  // sidebar link could show stale prices/enabled-state until something
  // (like clicking Sync) explicitly calls router.refresh(). Setting the
  // dynamic staleTime to 0 forces every dynamic route to refetch fresh data
  // on every navigation, so what you see always matches the database.
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
  // Stops the HTML document itself (not the hashed /_next/static assets,
  // which are already cached forever and safe since their filename changes
  // every build) from being cached by the browser or an in-between CDN.
  // Without this, a visitor who already has a tab open is fine (the version
  // watcher below reloads them), but someone hitting the URL fresh right
  // after a deploy could still be served a stale cached HTML shell that
  // points at deleted JS chunk files and errors out.
  async headers() {
    return [
      {
        // Deliberately excludes /_next/static/* (and favicon/icons) — those
        // filenames already change on every build because Next hashes them,
        // so they're safe to cache forever and SHOULD stay cached for speed.
        // This only targets pages/HTML/API responses, which don't have that
        // built-in cache-busting.
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
