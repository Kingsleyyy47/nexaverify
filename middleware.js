import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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

  function updateResponseCookie(name, value, options) {
    request.cookies.set({ name, value, ...options });
    const previousCookies = response.cookies.getAll();
    response = NextResponse.next({ request: { headers: request.headers } });
    previousCookies.forEach((cookie) => response.cookies.set(cookie));
    response.cookies.set({ name, value, ...options });
  }

  function redirectWithCookies(path) {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set(name, value, options) {
          updateResponseCookie(name, value, options);
        },
        remove(name, options) {
          updateResponseCookie(name, "", options);
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
    return redirectWithCookies("/login");
  }

  if (user && isAuthRoute) {
    return redirectWithCookies("/dashboard");
  }

  if (user && (isAdminRoute || isCustomerRoute || isSetUsernameRoute)) {
    // getUser() above verifies the session. Use the server-side key for this
    // one row, just as getSessionProfile() does in page and API renders.
    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role, username")
      .eq("id", user.id)
      .single();

    // A failed lookup does not mean this user lacks a username. Keep admin
    // access closed on an error, but let customer pages show their account
    // data error rather than redirecting everyone to /set-username.
    if (profileError) {
      if (isAdminRoute) {
        return redirectWithCookies("/dashboard");
      }
      return response;
    }

    if (isAdminRoute && (!profile || profile.role !== "admin")) {
      return redirectWithCookies("/dashboard");
    }

    // No username yet (the rare signup race condition) — force them to set
    // one before anything else, admin or customer.
    if (!isSetUsernameRoute && !profile?.username) {
      return redirectWithCookies("/set-username");
    }

    // Already have a username — nothing to do on /set-username.
    if (isSetUsernameRoute && profile?.username) {
      return redirectWithCookies("/dashboard");
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
