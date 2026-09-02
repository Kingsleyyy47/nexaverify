"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900";

// Upload-from-device with the URL field kept as a manual backup — per the
// business owner's explicit request: image upload from phone or computer,
// with URL as a fallback, not URL-only. Uploading just fills the same
// `value`/`onChange` the URL text field itself uses (via
// /api/admin/logo-upload), so nothing downstream — PlatformLogoManager,
// CategoryManager, or their save routes — needs to know or care whether a
// URL was typed in by hand or came from an upload.
export default function ImageUploadField({ value, onChange, placeholder }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/logo-upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      onChange(data.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={INPUT_CLASS}
        />
        <label className="btn-secondary btn-sm shrink-0 cursor-pointer flex items-center gap-1 whitespace-nowrap">
          <Upload size={13} />
          {uploading ? "Uploading…" : "Upload"}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            disabled={uploading}
          />
        </label>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
    </div>
  );
}
