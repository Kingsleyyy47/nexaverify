import { NextResponse } from "next/server";

// Always runs fresh on the server (never cached) so it reports whichever
// deployment is CURRENTLY live — see components/VersionWatcher.js, which
// polls this and compares it against the build id the page loaded with.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { version: process.env.NEXT_PUBLIC_BUILD_ID || "dev" },
    { headers: { "Cache-Control": "no-cache, no-store, must-revalidate" } }
  );
}
