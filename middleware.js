import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

// Route protection:
// - /login, /, /faq, /website (public "we also build websites" page) are public
// - /dashboard, /products, /wallet, /topup, /rentals, /history, /get-a-website
//   require any logged-in user (plus the old /buy, /numbers redirect stubs)
// - /admin/* requires role='admin' on the profiles row
// - /set-username requires login but nothing else — it's where anyone with
//   no profiles.username gets sent (see the race-condition note in
//   schema.sql's handle_new_user()) before they can reach anything else
// API routes (/api/*) are excluded here (see matcher below) — they do their
// own auth checks and return proper 401/403 JSON instead of redirecting.
export async function middleware(request) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set(name, value, options) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login");
  const isAdminRoute = pathname.startsWith("/admin");
  const isSetUsernameRoute = pathname.startsWith("/set-username");
  const isCustomerRoute = [
    "/dashboard",
    "/products",
    "/wallet",
    "/topup",
    "/rentals",
    "/history",
    "/get-a-website",
    "/buy", // old route, redirects to /products
    "/numbers", // old route, redirects to /rentals
  ].some((prefix) => pathname.startsWith(prefix));

  if (!user && (isAdminRoute || isCustomerRoute || isSetUsernameRoute)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (user && (isAdminRoute || isCustomerRoute || isSetUsernameRoute)) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, username")
      .eq("id", user.id)
      .single();

    // Oct 2026 incident: this used to ignore `error` entirely, so a failed
    // profile lookup (an RLS hiccup, a rejected/stale JWT, any transient
    // Supabase issue) looked IDENTICAL to "this user has no username yet" —
    // `profile` came back undefined either way. Since this runs on every
    // page load for every signed-in user, that silently bounced the entire
    // site to /set-username the moment the lookup started failing, even for
    // users who'd had a username for months. Admin access still fails
    // closed below (no readable profile => not admin, same as before) since
    // that's the safe default for a permissions check, but a lookup error
    // must not be treated as "no username" — that's a data fact we don't
    // actually know when the query itself failed.
    if (profileError) {
      if (isAdminRoute) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      return response;
    }

    if (isAdminRoute && (!profile || profile.role !== "admin")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    // No username yet (the rare signup race condition) — force them to set
    // one before anything else, admin or customer.
    if (!isSetUsernameRoute && !profile?.username) {
      return NextResponse.redirect(new URL("/set-username", request.url));
    }

    // Already have a username — nothing to do on /set-username.
    if (isSetUsernameRoute && profile?.username) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
