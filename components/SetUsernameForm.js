"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetUsernameForm({ userId, currentUsername }) {
  const router = useRouter();
  const [username, setUsername] = useState(currentUsername || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch(`/api/admin/users/${userId}/set-username`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update username");

      setSuccess(`Username set to "${data.username}".`);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
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
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {success && <p className="text-sm text-brand-700 dark:text-brand-400">{success}</p>}

      <button type="submit" disabled={loading} className="btn-secondary btn-sm">
        {loading ? "Saving…" : currentUsername ? "Update username" : "Set username"}
      </button>
    </form>
  );
}
