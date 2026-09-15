import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { logError } from "@/lib/errorLog";

// The only way app/error.js and app/global-error.js (client-side React error
// boundaries — "use client", can't hold the service-role key themselves) get
// a rendering error into error_logs. Deliberately narrow: it only accepts a
// message/stack/route/digest and only ever inserts — never reads anything
// back. Public on purpose (a signed-out visitor can hit a render error too),
// but every field is truncated hard so a hostile or just-broken client can't
// write unbounded rows.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { user } = await getSessionProfile();

  const message = String(body?.message || "Unknown client-side error").slice(0, 500);
  const stack = body?.stack ? String(body.stack).slice(0, 4000) : null;
  const route = body?.route ? String(body.route).slice(0, 300) : "(client)";
  const digest = body?.digest ? String(body.digest).slice(0, 200) : null;

  const referenceId = await logError({
    error: { name: "ClientRenderError", message, stack, code: digest },
    route,
    userId: user?.id || null,
    context: { source: "client-error-boundary", digest },
  });

  return NextResponse.json({ referenceId });
}
