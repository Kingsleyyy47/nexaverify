"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, AlertTriangle, PlusCircle } from "lucide-react";

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900";

const EMPTY_CREDENTIALS = {
  username: "",
  email: "",
  password: "",
  emailPassword: "",
  twoFa: "",
  recoveryEmail: "",
  recoveryEmailPassword: "",
};

// Admin-only "Single Product" section — its own page (see
// app/admin/digital-accounts/single-product/page.js), separate from Bulk
// Account Upload, for stocking a product template one account at a time
// instead of building a CSV. Deliberately does NOT create a new category or
// template here — those are picked from what already exists (Categories /
// Product Templates pages), same product the customer sees, just adding one
// more unit of stock to it. The actual insert
// (app/api/admin/digital-accounts/templates/[id]/single) re-validates
// server-side with the exact same rule as CSV upload
// (lib/digitalAccountsCsv.js#validateAccountFields) — this component just
// mirrors that rule to keep the button disabled until it'd pass.
export default function SingleProductForm() {
  const [categories, setCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [fields, setFields] = useState(EMPTY_CREDENTIALS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const [catRes, tplRes] = await Promise.all([
          fetch("/api/admin/digital-accounts/categories"),
          fetch("/api/admin/digital-accounts/templates"),
        ]);
        const catData = await catRes.json();
        const tplData = await tplRes.json();
        if (!catRes.ok) throw new Error(catData.error || "Could not load categories.");
        if (!tplRes.ok) throw new Error(tplData.error || "Could not load product templates.");
        setCategories(catData.categories || []);
        setTemplates(tplData.templates || []);
        if (catData.categories?.length) setCategoryId(catData.categories[0].id);
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const templatesInCategory = useMemo(
    () => templates.filter((t) => t.category_id === categoryId && !t.archived),
    [templates, categoryId]
  );

  // Reset the template picker whenever the category changes (or the current
  // template no longer belongs to it) so it's never possible to submit a
  // template/category pair that don't actually match.
  useEffect(() => {
    if (!templatesInCategory.some((t) => t.id === templateId)) {
      setTemplateId(templatesInCategory[0]?.id || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, templatesInCategory]);

  const selectedTemplate = templatesInCategory.find((t) => t.id === templateId) || null;

  function setField(key, value) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  // Same rule as lib/digitalAccountsCsv.js#validateAccountFields, mirrored
  // here purely so the submit button is disabled before the admin even
  // tries — the server re-checks this itself regardless.
  const password = fields.password.trim();
  const hasIdentifier = fields.email.trim() || fields.username.trim();
  const canSubmit = Boolean(templateId) && Boolean(password) && Boolean(hasIdentifier);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!templateId) {
      setError("Select a product template first.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }
    if (!hasIdentifier) {
      setError("Enter an email or a username — at least one is required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/digital-accounts/templates/${templateId}/single`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the account.");

      setSuccess("Account added to the template.");
      // Keeps category + template selected and clears only the credential
      // fields — this is the "add them one by one" flow, so the next
      // account for the SAME template is one submit away, not a re-pick.
      setFields(EMPTY_CREDENTIALS);
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, stockCount: (t.stockCount || 0) + 1 } : t))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400 dark:text-night-400">Loading categories and templates…</p>;
  }

  if (loadError) {
    return <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>;
  }

  if (categories.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-night-400">
        No categories yet — create one at Categories first.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      <div>
        <label className="block text-sm font-bold mb-1.5">Category</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={INPUT_CLASS}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-bold mb-1.5">Product Template</label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          disabled={templatesInCategory.length === 0}
          className={INPUT_CLASS}
        >
          {templatesInCategory.length === 0 ? (
            <option value="">No templates in this category</option>
          ) : (
            templatesInCategory.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.stockCount || 0} in stock
              </option>
            ))
          )}
        </select>
        {templatesInCategory.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-night-400 mt-1.5">
            No product templates in this category yet — create one at Product Templates first.
          </p>
        )}
        {selectedTemplate?.price_ngn != null && (
          <p className="text-xs text-gray-400 dark:text-night-400 mt-1.5">
            Sells for ₦{Number(selectedTemplate.price_ngn).toLocaleString("en-US")} · currently{" "}
            {selectedTemplate.stockCount || 0} in stock.
          </p>
        )}
      </div>

      <div className="pt-1 border-t border-gray-100 dark:border-night-700" />

      <div>
        <label className="block text-sm font-bold mb-1.5">Username</label>
        <input
          type="text"
          value={fields.username}
          onChange={(e) => setField("username", e.target.value)}
          placeholder="e.g., @lifestyle_influencer"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label className="block text-sm font-bold mb-1.5">
          Password <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={fields.password}
          onChange={(e) => setField("password", e.target.value)}
          placeholder="Account password"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label className="block text-sm font-bold mb-1.5">Email</label>
        <input
          type="text"
          value={fields.email}
          onChange={(e) => setField("email", e.target.value)}
          placeholder="Associated email"
          className={INPUT_CLASS}
        />
        <p className="text-xs text-gray-400 dark:text-night-400 mt-1.5">
          Email or username — at least one is required.
        </p>
      </div>

      <div>
        <label className="block text-sm font-bold mb-1.5">Email Password</label>
        <input
          type="text"
          value={fields.emailPassword}
          onChange={(e) => setField("emailPassword", e.target.value)}
          placeholder="Password for the email above"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label className="block text-sm font-bold mb-1.5">2FA</label>
        <input
          type="text"
          value={fields.twoFa}
          onChange={(e) => setField("twoFa", e.target.value)}
          placeholder="Two-factor code or backup key"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label className="block text-sm font-bold mb-1.5">Recovery Email</label>
        <input
          type="text"
          value={fields.recoveryEmail}
          onChange={(e) => setField("recoveryEmail", e.target.value)}
          placeholder="Recovery email address"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label className="block text-sm font-bold mb-1.5">Recovery Email Password</label>
        <input
          type="text"
          value={fields.recoveryEmailPassword}
          onChange={(e) => setField("recoveryEmailPassword", e.target.value)}
          placeholder="Password for the recovery email"
          className={INPUT_CLASS}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-1.5 text-sm text-brand-700 dark:text-brand-400">
          <KeyRound size={14} /> {success}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <PlusCircle size={16} /> {submitting ? "Adding…" : "Add Account to Template"}
      </button>
    </form>
  );
}
