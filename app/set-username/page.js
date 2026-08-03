"use client";

import { useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import NavLogo from "@/components/NavLogo";

// Middleware redirects any logged-in visitor with no profiles.username here
// — normally only hit by the rare signup race condition described in
// schema.sql's handle_new_user(). One field, no way out except setting one.
export default function SetUsernamePage() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/set-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save username");

      // Hard navigation, not router.push()+refresh() — see the same fix
      // and comment on app/login/page.js (stale Router Cache can bounce a
      // soft push back to /login or /set-username on the first click).
      window.location.href = "/dashboard";
      return;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 dark:bg-night-950">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8">
          <NavLogo />
        </div>

        <h1 className="text-2xl font-bold mb-1 dark:text-night-100">Choose a username</h1>
        <p className="text-sm text-gray-500 dark:text-night-300 mb-8">
          Your account doesn&apos;t have a username yet — you&apos;ll need one to sign in from now
          on, so pick one before continuing.
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
              autoFocus
            />
            <span className="hint">3-20 characters, starts with a letter — letters, numbers, and underscores only.</span>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Saving…" : "Save and continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
