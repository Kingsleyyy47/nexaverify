"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2, X, Check } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900";

// Category CRUD for the Bulk Account Upload feature — see
// app/admin/digital-accounts/categories/page.js. Categories themselves have
// no favorite/archive/enable state (only product templates do); this is a
// plain create/rename/delete list.
export default function CategoryManager() {
  const [categories, setCategories] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [rowError, setRowError] = useState("");

  const [pendingDelete, setPendingDelete] = useState(null); // category or null

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/digital-accounts/categories");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load categories.");
      setCategories(data.categories || []);
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
    if (!name.trim()) {
      setCreateError("Enter a category name.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/digital-accounts/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create category");
      setName("");
      setDescription("");
      await load();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(category) {
    setRowError("");
    setEditingId(category.id);
    setEditName(category.name);
    setEditDescription(category.description || "");
  }

  async function saveEdit(id) {
    setRowError("");
    if (!editName.trim()) {
      setRowError("Category name is required.");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/digital-accounts/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, description: editDescription }),
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
    const category = pendingDelete;
    setPendingDelete(null);
    if (!category) return;
    try {
      const res = await fetch(`/api/admin/digital-accounts/categories/${category.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete category");
      await load();
    } catch (err) {
      setRowError(err.message);
    }
  }

  return (
    <div>
      <form onSubmit={handleCreate} className="mb-6 pb-6 border-b border-gray-100 dark:border-night-700">
        <h3 className="font-bold text-[15px] mb-3">Create New Category</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-night-300 mb-1">Category name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Discord"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-night-300 mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Discord accounts"
              className={INPUT_CLASS}
            />
          </div>
        </div>
        {createError && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{createError}</p>}
        <button type="submit" disabled={creating} className="btn-primary btn-sm mt-3">
          {creating ? "Creating…" : "+ Create Category"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-400 dark:text-night-400">Loading categories…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      ) : categories.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-night-400">No categories yet — create one above.</p>
      ) : (
        <div className="space-y-2">
          {rowError && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{rowError}</p>}
          {categories.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-gray-100 dark:border-night-700"
            >
              {editingId === c.id ? (
                <div className="flex-1 grid gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={INPUT_CLASS}
                  />
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Description"
                    className={INPUT_CLASS}
                  />
                </div>
              ) : (
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{c.name}</div>
                  <div className="text-xs text-gray-400 dark:text-night-400">
                    {c.description ? `${c.description} · ` : ""}
                    {c.templateCount} product {c.templateCount === 1 ? "group" : "groups"}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1.5 shrink-0">
                {editingId === c.id ? (
                  <>
                    <button
                      onClick={() => saveEdit(c.id)}
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
                    <button onClick={() => startEdit(c)} className="btn-secondary btn-sm flex items-center gap-1">
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      onClick={() => setPendingDelete(c)}
                      className="btn-danger btn-sm flex items-center gap-1"
                    >
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
        title={`Delete "${pendingDelete?.name}"?`}
        message="This also deletes every product template (and its uploaded stock) under this category. Past orders already placed are kept, just unlinked. This can't be undone."
        confirmLabel="Yes, delete it"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
