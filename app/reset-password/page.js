"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import NavLogo from "@/components/NavLogo";
import { createClient } from "@/lib/supabase/client";

// Lands here from the email link sent by /forgot-password. The Supabase
// browser client (createBrowserClient, detectSessionInUrl on by default)
// parses the recovery token out of the URL itself on load and fires a
// PASSWORD_RECOVERY auth event — no manual token handling needed here, just
// wait for that event (or an existing session) before allowing the form.
export default function ResetPasswordPage() {
  const [status, setStatus] = useState("checking"); // checking | ready | invalid
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setStatus("ready");
    });

    // Covers the case where the event already fired before this listener
    // was attached (detectSessionInUrl runs immediately on client creation).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStatus("ready");
    });

    // Give the URL-parsing a few seconds before concluding the link is
    // missing/expired/already used.
    const timeout = setTimeout(() => {
      setStatus((s) => (s === "checking" ? "invalid" : s));
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Hard navigation, not router.push() — same reasoning as the login
      // fix: avoids a stale Router Cache bouncing this back to /login right
      // after a fresh session was just established.
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err.message || "Could not update password");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 dark:bg-night-950">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8">
          <NavLogo />
        </div>

        <h1 className="text-2xl font-bold mb-1 dark:text-night-100">Set a new password</h1>

        {status === "checking" && (
          <p className="text-sm text-gray-500 dark:text-night-300 mb-8">Confirming your reset link…</p>
        )}

        {status === "invalid" && (
          <div className="space-y-4">
            <p className="text-sm text-red-600 dark:text-red-400">
              This reset link is invalid or has expired.
            </p>
            <Link href="/forgot-password" className="btn-primary inline-block">
              Request a new link
            </Link>
          </div>
        )}

        {status === "ready" && (
          <>
            <p className="text-sm text-gray-500 dark:text-night-300 mb-8">
              Choose a new password for your account.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="field">
                <label htmlFor="password">New password</label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
                />
              </div>

              <div className="field">
                <label htmlFor="confirm-password">Confirm new password</label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Saving…" : "Save new password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
