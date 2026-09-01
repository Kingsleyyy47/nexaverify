"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, KeyRound, AlertTriangle } from "lucide-react";

const SAMPLE_CSV = `username,password,email,email_password,two_fa,recovery_email,recovery_email_password
john_doe,pass123,john@email.com,emailpass123,123456,recovery@email.com,recpass123
jane_smith,mypass,jane@email.com,,,,`;

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
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function load() {
      setLoadingTemplates(true);
      try {
        const res = await fetch("/api/admin/digital-accounts/templates");
        const data = await res.json();
        if (res.ok) {
          setTemplates(data.templates || []);
          if (data.templates?.length) setTemplateId(data.templates[0].id);
        }
      } finally {
        setLoadingTemplates(false);
      }
    }
    load();
  }, []);

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
      setError("Choose a CSV file to upload.");
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setError("Upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleUpload} className="space-y-5">
      <div>
        <label className="block text-sm font-bold mb-1.5">Select Product Template</label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          disabled={loadingTemplates || templates.length === 0}
          className="w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900"
        >
          {templates.length === 0 ? (
            <option value="">Choose a product template</option>
          ) : (
            templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.categoryName} — {t.name}
              </option>
            ))
          )}
        </select>
        {!loadingTemplates && templates.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-night-400 mt-1.5">
            No product templates yet — create one at Product Templates first.
          </p>
        )}
      </div>

      <label className="block border-2 border-dashed border-gray-200 dark:border-night-700 rounded-2xl p-10 text-center cursor-pointer hover:border-brand-300 dark:hover:border-brand-500 transition">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="hidden"
        />
        <Upload size={32} className="mx-auto mb-3 text-gray-400 dark:text-night-500" />
        <div className="font-bold text-sm">Upload CSV File</div>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">Choose a CSV file with account credentials</p>
        <span className="btn-secondary btn-sm mt-3 inline-block">
          {file ? file.name : "Choose File"}
        </span>
        {!file && <span className="text-xs text-gray-400 dark:text-night-500 ml-2">No file chosen</span>}
      </label>

      <div>
        <h4 className="font-bold text-sm mb-2">CSV Format Requirements:</h4>
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
            </ul>
          </div>

          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800 dark:text-blue-300 mb-1.5">
              <KeyRound size={13} /> Sample CSV format:
            </div>
            <pre className="text-[11px] text-blue-700 dark:text-blue-400 whitespace-pre-wrap break-all">{SAMPLE_CSV}</pre>
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
