"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import NavLogo from "@/components/NavLogo";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 dark:bg-night-950">
      <div className="absolute top-6 left-6">
        <Link
          href="/login"
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 dark:text-night-300 hover:text-brand-700 dark:hover:text-brand-300"
        >
          <ArrowLeft size={16} /> Back to sign in
        </Link>
      </div>
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8">
          <NavLogo />
        </div>

        <h1 className="text-2xl font-bold mb-1 dark:text-night-100">Reset your password</h1>
        <p className="text-sm text-gray-500 dark:text-night-300 mb-8">
          Enter your username or email and we&apos;ll send a link to reset your password.
        </p>

        {sent ? (
          <div className="rounded-xl border border-brand-100 dark:border-brand-900 bg-brand-50/50 dark:bg-brand-950/20 px-4 py-3 text-sm text-brand-800 dark:text-brand-300">
            If an account exists for that username or email, a reset link is on its way — check
            your inbox.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="field">
              <label htmlFor="identifier">Username or email</label>
              <input
                id="identifier"
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. johndoe or you@example.com"
                autoCapitalize="none"
                autoCorrect="off"
                autoFocus
              />
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
