"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, KeyRound, AlertTriangle, Sparkles } from "lucide-react";

// Loose match between a detected category hint (a label line like "TIKTOK",
// or an unambiguous format guess like "Facebook" — see
// lib/digitalAccountsCsv.js#parseAndValidateAccountsCsv) and an existing
// category name ("TikTok", "Tik Tok", etc.) — strips everything but
// letters/digits and compares case-insensitively, matching either direction
// so "Instagram" matches a hint of "insta" and vice versa.
function normalizeForMatch(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const SAMPLE_CSV = `username,password,email,email_password,two_fa,recovery_email,recovery_email_password,year,friends_count
john_doe,pass123,john@email.com,emailpass123,123456,recovery@email.com,recpass123,2019,850
jane_smith,mypass,jane@email.com,,,,,,`;

// These are pasted in exactly as-is — no header row, no format picker — and
// the parser (lib/digitalAccountsCsv.js) auto-detects the delimiter and
// column layout from the column count. Shown here so an admin can match
// whatever a customer-care-supplied log line looks like.
const PLATFORM_FORMATS = [
  { name: "Single column (just links, or just emails)", sample: "https://facebook.com/profile.php?id=123\nhttps://facebook.com/profile.php?id=456" },
  { name: "Simple CSV/TXT", sample: "username_or_email,password" },
  { name: "Default stock order", sample: "username,password,2fa,email,email_password,recovery_email,recovery_email_password,year,friends_count" },
  { name: "Default order with blanks", sample: "username,password,,email,email_password,,," },
  { name: "Facebook", sample: "username|password|email|email_password|recovery_email|two_fa|year|friends_count" },
  { name: "Facebook 2 (no recovery/2FA)", sample: "username|password|email|email_password||year|friends_count" },
  { name: "Instagram / TikTok", sample: "username:password:email:email_password" },
  { name: "Twitter", sample: "username|password|email|email_password|two_fa" },
];

// Admin-only bulk stocker for a product template — see
// app/admin/digital-accounts/upload/page.js and
// app/api/admin/digital-accounts/templates/[id]/upload/route.js (which does
// the actual parsing/validation server-side; this component just presents
// the requirements and surfaces whatever the server rejected).
export default function BulkAccountUpload() {
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState([]);
  const [success, setSuccess] = useState("");
  // Category auto-detection (see app/api/admin/digital-accounts/detect-
  // category) — `detecting` covers the brief fetch right after a file is
  // chosen, `detectedHint` is the raw guess for display (e.g. "TIKTOK"),
  // `matchedCategoryName` is the existing category it actually matched
  // (null if the guess didn't match anything real), and `showAllTemplates`
  // lets the admin dismiss the auto-filter and go back to picking from
  // every template — never enforced, purely a shortcut.
  const [detecting, setDetecting] = useState(false);
  const [detectedHint, setDetectedHint] = useState(null);
  const [matchedCategoryName, setMatchedCategoryName] = useState(null);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function load() {
      setLoadingTemplates(true);
      try {
        const res = await fetch("/api/admin/digital-accounts/templates");
        const data = await res.json();
        if (res.ok) {
          const activeTemplates = (data.templates || []).filter((t) => !t.archived);
          setTemplates(activeTemplates);
          // Deliberately NOT defaulted to activeTemplates[0] — that silently
          // "hardcoded" whatever template happened to load first as a
          // fallback, so a file the auto-detector couldn't match still
          // uploaded successfully, just into the wrong category, with
          // nothing forcing the admin to notice. Left unset here: either a
          // successful detection (handleFileChange below) fills it in, or
          // the admin has to pick one themselves — and the submit guard
          // further down refuses to upload with nothing selected.
        }
      } finally {
        setLoadingTemplates(false);
      }
    }
    load();
  }, []);

  const visibleTemplates =
    showAllTemplates || !matchedCategoryName
      ? templates
      : templates.filter((t) => t.categoryName === matchedCategoryName);

  async function handleFileChange(selected) {
    setFile(selected);
    setDetectedHint(null);
    setMatchedCategoryName(null);
    setShowAllTemplates(false);
    // Clears whatever template a PREVIOUS file's detection picked — without
    // this, choosing a second file that fails to auto-detect silently left
    // the first file's guessed template selected, which is the same
    // "hardcoded placeholder" bug as defaulting to activeTemplates[0]: a
    // stale selection nothing forces the admin to notice or reconsider.
    setTemplateId("");
    if (!selected) return;

    setDetecting(true);
    try {
      const formData = new FormData();
      formData.append("file", selected);
      const res = await fetch("/api/admin/digital-accounts/detect-category", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      const hint = data?.categoryHint || null;
      if (!hint) return;

      setDetectedHint(hint);
      const hintNorm = normalizeForMatch(hint);
      const match = templates.find((t) => {
        const catNorm = normalizeForMatch(t.categoryName);
        return catNorm && (catNorm === hintNorm || catNorm.includes(hintNorm) || hintNorm.includes(catNorm));
      });
      if (match) {
        setMatchedCategoryName(match.categoryName);
        setTemplateId(match.id);
      }
    } catch {
      // Detection is advisory only — a failed guess just leaves the
      // dropdown exactly as it already was (full list, nothing pre-picked).
    } finally {
      setDetecting(false);
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    setError("");
    setRowErrors([]);
    setSuccess("");

    if (!templateId) {
      setError("Select a product template first.");
      return;
    }
    if (!file) {
      setError("Choose a CSV or TXT file to upload.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/admin/digital-accounts/templates/${templateId}/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed.");
        setRowErrors(data.rowErrors || []);
        return;
      }
      setSuccess(`Uploaded ${data.inserted} account${data.inserted === 1 ? "" : "s"} successfully.`);
      setFile(null);
      setDetectedHint(null);
      setMatchedCategoryName(null);
      setShowAllTemplates(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setError("Upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleUpload} className="space-y-5">
      <label className="block border-2 border-dashed border-gray-200 dark:border-night-700 rounded-2xl p-10 text-center cursor-pointer hover:border-brand-300 dark:hover:border-brand-500 transition">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv,.txt,text/plain"
          onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
          className="hidden"
        />
        <Upload size={32} className="mx-auto mb-3 text-gray-400 dark:text-night-500" />
        <div className="font-bold text-sm">Upload CSV or TXT File</div>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          Choose a CSV or TXT file with account credentials. Comma, pipe, colon, semicolon, and tab-delimited logs
          are all supported — the category is auto-detected from the file, no need to pick it first.
        </p>
        <span className="btn-secondary btn-sm mt-3 inline-block">
          {file ? file.name : "Choose File"}
        </span>
        {!file && <span className="text-xs text-gray-400 dark:text-night-500 ml-2">No file chosen</span>}
        {detecting && <p className="text-xs text-gray-400 dark:text-night-500 mt-2">Detecting category…</p>}
      </label>

      {detectedHint && (
        <div className="flex items-start gap-2 rounded-lg bg-brand-50 dark:bg-brand-950/40 border border-brand-100 dark:border-brand-900 px-3.5 py-2.5 text-xs">
          <Sparkles size={14} className="shrink-0 mt-0.5 text-brand-600 dark:text-brand-400" />
          {matchedCategoryName ? (
            <p className="text-brand-800 dark:text-brand-300">
              Detected <strong>{detectedHint}</strong> — pre-selected a template in{" "}
              <strong>{matchedCategoryName}</strong> below.{" "}
              {!showAllTemplates && (
                <button type="button" onClick={() => setShowAllTemplates(true)} className="underline font-semibold">
                  Show all templates
                </button>
              )}
            </p>
          ) : (
            <p className="text-brand-800 dark:text-brand-300">
              Detected <strong>{detectedHint}</strong>, but no matching category was found — choose a template
              manually below.
            </p>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-bold mb-1.5">Select Product Template</label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          disabled={loadingTemplates || templates.length === 0}
          className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
        >
          {visibleTemplates.length === 0 ? (
            <option value="">Choose a product template</option>
          ) : (
            <>
              {!templateId && (
                <option value="" disabled>
                  Choose a product template…
                </option>
              )}
              {visibleTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.categoryName} — {t.name}
                </option>
              ))}
            </>
          )}
        </select>
        {!loadingTemplates && templates.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-night-400 mt-1.5">
            No active product templates yet — create or unarchive one at Product Templates first.
          </p>
        )}
      </div>

      <div>
        <h4 className="font-bold text-sm mb-2">CSV/TXT Format Requirements:</h4>
        <div className="rounded-xl bg-gray-50 dark:bg-night-800 p-4 space-y-3 text-sm">
          <div>
            <div className="font-semibold text-xs text-gray-500 dark:text-night-300 mb-1">Required columns:</div>
            <ul className="text-xs text-gray-500 dark:text-night-400 space-y-0.5 list-disc list-inside">
              <li>
                <strong>password</strong> - Account password (required)
              </li>
              <li>
                <strong>email</strong> OR <strong>username</strong> - Account identifier (at least one required)
              </li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-xs text-gray-500 dark:text-night-300 mb-1">Optional columns:</div>
            <ul className="text-xs text-gray-500 dark:text-night-400 space-y-0.5 list-disc list-inside">
              <li>
                <strong>email_password</strong> - Email account password
              </li>
              <li>
                <strong>two_fa</strong> or <strong>two_fa_code</strong> - Two-factor authentication code
              </li>
              <li>
                <strong>recovery_email</strong> - Recovery email address
              </li>
              <li>
                <strong>recovery_email_password</strong> - Recovery email password
              </li>
              <li>
                <strong>username</strong> - Account username (if email is primary identifier)
              </li>
              <li>
                <strong>year</strong> - Account creation year (Facebook-style logs)
              </li>
              <li>
                <strong>friends_count</strong> or <strong>no_of_friends</strong> - Friend count (Facebook-style logs)
              </li>
              <li>
                <strong>extra_data</strong>, <strong>cookies</strong>, or <strong>notes</strong> - Any leftover
                session/cookie text
              </li>
              <li>
                <strong>login_link</strong>, <strong>link</strong>, or <strong>url</strong> - An actual login/profile
                link, shown to the customer as a clickable &quot;Login&quot; button
              </li>
            </ul>
          </div>

          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900 p-3">
            <div className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">
              Cookies/session text and links are both auto-detected
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              A field that&apos;s extremely long or looks like browser session data (e.g. contains
              &quot;csrftoken&quot; or &quot;sessionid&quot;) is automatically pulled out into its own
              &quot;Extra / Cookies&quot; field instead of overwriting or shifting the real email/password
              columns next to it. A field that&apos;s an actual link (starts with &quot;http://&quot;,
              &quot;https://&quot;, or &quot;www.&quot;) is detected separately as the account&apos;s login link
              — the two are never confused, even when a cookie value is extremely long.
            </p>
          </div>

          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800 dark:text-blue-300 mb-1.5">
              <KeyRound size={13} /> Header-row format (works in a .csv or .txt file):
            </div>
            <pre className="text-[11px] text-blue-700 dark:text-blue-400 whitespace-pre-wrap break-all">{SAMPLE_CSV}</pre>
          </div>

          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 p-3">
            <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1.5">
              No header? No problem — paste logs straight in as-is
            </div>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mb-2">
              No column names needed and every column doesn't have to be included — the delimiter (comma, "|", ":",
              ";", or tab) and column layout are auto-detected from the file. A file with just ONE value per line
              (no delimiter at all) is supported too — each line is auto-detected as a link, an email, or a plain
              username, with no password stored, for products that are sold as a bare list rather than full
              credentials. A lone label line at the top (e.g. a bare "TIKTOK" heading) is also used to guess the
              category above, so the right template gets pre-selected automatically. These are the formats it
              recognizes:
            </p>
            <div className="space-y-1.5">
              {PLATFORM_FORMATS.map((f) => (
                <div key={f.name}>
                  <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">{f.name}</div>
                  <pre className="text-[11px] text-emerald-700 dark:text-emerald-400 whitespace-pre-wrap break-all">
                    {f.sample}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p>{error}</p>
            {rowErrors.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs">
                {rowErrors.map((r, i) => (
                  <li key={i}>{r.row > 0 ? `Row ${r.row}: ` : ""}{r.message}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {success && <p className="text-sm text-brand-700 dark:text-brand-400">{success}</p>}

      <button type="submit" disabled={uploading} className="btn-primary w-full flex items-center justify-center gap-2">
        <Upload size={16} /> {uploading ? "Uploading…" : "Upload Accounts to Template"}
      </button>
    </form>
  );
}
