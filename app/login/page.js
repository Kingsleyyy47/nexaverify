"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState(searchParams.get("mode") === "signup" ? "signup" : "signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      if (mode === "signin") {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not sign in");

        router.push("/dashboard");
        router.refresh();
      } else {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not create account");

        setNotice("Account created. Check your email to confirm, then sign in with your username.");
        setMode("signin");
        setPassword("");
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 dark:bg-night-950">
      <div className="flex flex-col p-8">
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 dark:text-night-300 hover:text-brand-700 dark:hover:text-brand-300"
          >
            <ArrowLeft size={16} /> Back to home
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex-1 flex items-center justify-center -mt-8">
          <div className="w-full max-w-sm">
            <div className="flex items-center gap-2.5 mb-10 font-extrabold text-lg text-brand-900 dark:text-night-100">
              <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700" />
              NexaVerify
            </div>

            <h1 className="text-2xl font-bold mb-1 dark:text-night-100">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-sm text-gray-500 dark:text-night-300 mb-8">
              {mode === "signin"
                ? "Sign in with your username to manage your wallet and rentals."
                : "Start renting phone numbers for SMS verification in minutes."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="field">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  type="text"
                  required
                  minLength={3}
                  maxLength={20}
                  pattern="[a-zA-Z][a-zA-Z0-9_]{2,19}"
                  title="3-20 characters, start with a letter, letters/numbers/underscores only"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. johndoe"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                {mode === "signup" && (
                  <span className="hint">3-20 characters, starts with a letter — letters, numbers, and underscores only.</span>
                )}
              </div>

              {mode === "signup" && (
                <div className="field">
                  <label htmlFor="email">Email address</label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              )}

              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              {notice && <p className="text-sm text-brand-700 dark:text-brand-400">{notice}</p>}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
              </button>
            </form>

            <p className="text-sm text-gray-500 dark:text-night-300 text-center mt-6">
              {mode === "signin" ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button className="font-semibold text-brand-700 dark:text-brand-400" onClick={() => setMode("signup")}>
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button className="font-semibold text-brand-700 dark:text-brand-400" onClick={() => setMode("signin")}>
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="hidden md:flex items-center justify-center bg-gradient-to-br from-brand-800 to-brand-500 text-white p-16">
        <div className="max-w-md">
          <div className="text-5xl opacity-50 mb-3 leading-none">&ldquo;</div>
          <p className="text-xl leading-relaxed mb-5">
            Instant, disposable phone numbers for SMS verification — no contracts, pay only for
            what you use.
          </p>
          <div className="text-sm opacity-75">NexaVerify</div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
