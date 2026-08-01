/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
};

export default nextConfig;
