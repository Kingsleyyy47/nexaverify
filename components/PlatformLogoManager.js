"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2, X, Check } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import AdaptiveLogo from "./AdaptiveLogo";
import ImageUploadField from "./ImageUploadField";

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900";

// One admin-wide place for platform logos — see the big comment on
// public.platform_logos in schema.sql. Add "TikTok" once here with a logo
// URL and it shows up automatically next to every service/product across
// DaisySMS Products, US Only, International, Social Boost, and any future
// provider, wherever its name contains "TikTok" — see
// lib/platformLogoMatch.js for the matching and
// components/usePlatformLogos.js for how each buy surface consumes this.
export default function PlatformLogoManager() {
  const [logos, setLogos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [platformName, setPlatformName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUrlDark, setLogoUrlDark] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState("");
  const [editLogoUrlDark, setEditLogoUrlDark] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [rowError, setRowError] = useState("");

  const [pendingDelete, setPendingDelete] = useState(null);

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/platform-logos");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load logos.");
      setLogos(data.logos || []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError("");
    if (!platformName.trim()) {
      setCreateError("Enter a platform name.");
      return;
    }
    if (!logoUrl.trim()) {
      setCreateError("Enter a logo URL.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/platform-logos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformName, logoUrl, logoUrlDark }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the logo");
      setPlatformName("");
      setLogoUrl("");
      setLogoUrlDark("");
      await load();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(logo) {
    setRowError("");
    setEditingId(logo.id);
    setEditName(logo.platform_name);
    setEditLogoUrl(logo.logo_url);
    setEditLogoUrlDark(logo.logo_url_dark || "");
  }

  async function saveEdit(id) {
    setRowError("");
    if (!editName.trim()) {
      setRowError("Platform name is required.");
      return;
    }
    if (!editLogoUrl.trim()) {
      setRowError("Logo URL is required.");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/platform-logos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformName: editName, logoUrl: editLogoUrl, logoUrlDark: editLogoUrlDark }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save changes");
      setEditingId(null);
      await load();
    } catch (err) {
      setRowError(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    const logo = pendingDelete;
    setPendingDelete(null);
    if (!logo) return;
    try {
      const res = await fetch(`/api/admin/platform-logos/${logo.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete the logo");
      await load();
    } catch (err) {
      setRowError(err.message);
    }
  }

  return (
    <div>
      <form onSubmit={handleCreate} className="mb-6 pb-6 border-b border-gray-100 dark:border-night-700">
        <h3 className="font-bold text-[15px] mb-3">Add Platform Logo</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-night-300 mb-1">
              Platform name
            </label>
            <input
              type="text"
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
              placeholder="e.g., TikTok, WhatsApp, Instagram"
              className={INPUT_CLASS}
            />
            <p className="text-[11px] text-gray-400 dark:text-night-400 mt-1">
              Matched (case-insensitive) against every service/product name site-wide.
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-night-300 mb-1">Logo URL</label>
            <ImageUploadField
              value={logoUrl}
              onChange={setLogoUrl}
              placeholder="https://…/tiktok-logo.png or upload a file"
            />
            <p className="text-[11px] text-gray-400 dark:text-night-400 mt-1">
              Upload an image from your phone or computer, or paste a URL directly — shown on a small
              white backdrop automatically so it stays legible in dark mode too.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-500 dark:text-night-300 mb-1">
              Dark mode logo URL (optional)
            </label>
            <ImageUploadField
              value={logoUrlDark}
              onChange={setLogoUrlDark}
              placeholder="https://…/tiktok-logo-white.png or upload a file"
            />
            <p className="text-[11px] text-gray-400 dark:text-night-400 mt-1">
              Only needed for pixel-perfect control — set this to swap in a different image (e.g. a
              white version) in dark mode instead of using the automatic backdrop above.
            </p>
          </div>
        </div>
        {createError && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{createError}</p>}
        <button type="submit" disabled={creating} className="btn-primary btn-sm mt-3">
          {creating ? "Adding…" : "+ Add Logo"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-400 dark:text-night-400">Loading logos…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      ) : logos.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-night-400">
          No platform logos yet — add one above (e.g. "TikTok") and it'll show up next to every matching
          service/product across the site.
        </p>
      ) : (
        <div className="space-y-2">
          {rowError && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{rowError}</p>}
          {logos.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-gray-100 dark:border-night-700"
            >
              {editingId === l.id ? (
                <div className="flex-1 grid gap-2 sm:grid-cols-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={INPUT_CLASS}
                  />
                  <ImageUploadField
                    value={editLogoUrl}
                    onChange={setEditLogoUrl}
                    placeholder="Logo URL"
                  />
                  <ImageUploadField
                    value={editLogoUrlDark}
                    onChange={setEditLogoUrlDark}
                    placeholder="Dark mode logo URL (optional)"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 min-w-0">
                  <AdaptiveLogo
                    logo={{ logoUrl: l.logo_url, logoUrlDark: l.logo_url_dark }}
                    className="w-9 h-9 rounded-lg shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{l.platform_name}</div>
                    <div className="text-xs text-gray-400 dark:text-night-400 truncate">{l.logo_url}</div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1.5 shrink-0">
                {editingId === l.id ? (
                  <>
                    <button
                      onClick={() => saveEdit(l.id)}
                      disabled={savingEdit}
                      className="btn-primary btn-sm flex items-center gap-1"
                    >
                      <Check size={14} /> Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="btn-secondary btn-sm flex items-center gap-1">
                      <X size={14} /> Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(l)} className="btn-secondary btn-sm flex items-center gap-1">
                      <Pencil size={14} /> Edit
                    </button>
                    <button onClick={() => setPendingDelete(l)} className="btn-danger btn-sm flex items-center gap-1">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        danger
        title={`Delete "${pendingDelete?.platform_name}" logo?`}
        message="This removes the logo from every service/product it currently matches, site-wide. This can't be undone."
        confirmLabel="Yes, delete it"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
