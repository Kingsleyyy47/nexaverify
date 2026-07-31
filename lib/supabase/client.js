"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client for use inside Client Components (login form,
// signup form, anything with an onClick/onSubmit handler).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
