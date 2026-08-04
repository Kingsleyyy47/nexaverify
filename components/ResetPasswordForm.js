"use client";

import { useState } from "react";

// Admin-only manual password reset — sets the password directly via the
// service role (see /api/admin/users/[id]/reset-password), no email link
// involved. For support cases where a customer can't get to their inbox.
export default function ResetPasswordForm({ userId }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not reset password");

      setSuccess("Password reset. Share the new password with the customer directly.");
      setPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="field">
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="text"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          autoCapitalize="none"
          autoCorrect="off"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {success && <p className="text-sm text-brand-700 dark:text-brand-400">{success}</p>}

      <button type="submit" disabled={loading} className="btn-secondary btn-sm">
        {loading ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}
