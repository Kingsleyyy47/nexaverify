"use client";

import { useEffect, useMemo, useState } from "react";
import { Star, Pencil, Archive, ArchiveRestore, Trash2, X, Check } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900";

function StockBadge({ count }) {
  if (count <= 0) {
    return <span className="badge badge-danger">Out of stock</span>;
  }
  return <span className="badge badge-success">{count} in stock</span>;
}

// Product template CRUD for the Bulk Account Upload feature — see
// app/admin/digital-accounts/templates/page.js. Mirrors the
// favorite/edit/archive/delete row pattern used across the app's other
// catalog managers (e.g. SocialBoostCatalogManager), just against
// digital_product_templates instead of a live provider catalog.
export default function ProductTemplateManager() {
  const [templates, setTemplates] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editState, setEditState] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [rowError, setRowError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const [tRes, cRes] = await Promise.all([
        fetch("/api/admin/digital-accounts/templates"),
        fetch("/api/admin/digital-accounts/categories"),
      ]);
      const tData = await tRes.json();
      const cData = await cRes.json();
      if (!tRes.ok) throw new Error(tData.error || "Could not load product templates.");
      if (!cRes.ok) throw new Error(cData.error || "Could not load categories.");
      setTemplates(tData.templates || []);
      setCategories(cData.categories || []);
      if (!categoryId && cData.categories?.length) setCategoryId(cData.categories[0].id);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryNameById = useMemo(() => {
    const map = {};
    for (const c of categories) map[c.id] = c.name;
    return map;
  }, [categories]);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError("");
    if (!categoryId) {
      setCreateError("Create a category first.");
      return;
    }
    if (!name.trim()) {
      setCreateError("Enter a product name.");
      return;
    }
    const priceValue = Number(price);
    if (price === "" || !Number.isFinite(priceValue) || priceValue < 0) {
      setCreateError("Enter a valid price.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/digital-accounts/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, name, priceNgn: price, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create product template");
      setName("");
      setPrice("");
      setDescription("");
      await load();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function patchTemplate(id, patch) {
    const res = await fetch(`/api/admin/digital-accounts/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not save changes");
    return data.template;
  }

  async function toggleFavorite(t) {
    setRowError("");
    setSavingId(t.id);
    try {
      await patchTemplate(t.id, { favorite: !t.favorite });
      await load();
    } catch (err) {
      setRowError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  async function toggleArchived(t) {
    setRowError("");
    setSavingId(t.id);
    try {
      await patchTemplate(t.id, { archived: !t.archived });
      await load();
    } catch (err) {
      setRowError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  function startEdit(t) {
    setRowError("");
    setEditingId(t.id);
    setEditState({ name: t.name, priceNgn: t.price_ngn, description: t.description || "", categoryId: t.category_id });
  }

  async function saveEdit(id) {
    setRowError("");
    if (!editState.name.trim() || !(Number(editState.priceNgn) >= 0)) {
      setRowError("Enter a valid name and price.");
      return;
    }
    setSavingId(id);
    try {
      await patchTemplate(id, editState);
      setEditingId(null);
      await load();
    } catch (err) {
      setRowError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete() {
    const t = pendingDelete;
    setPendingDelete(null);
    if (!t) return;
    try {
      const res = await fetch(`/api/admin/digital-accounts/templates/${t.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete");
      await load();
    } catch (err) {
      setRowError(err.message);
    }
  }

  const sorted = useMemo(() => {
    if (!templates) return [];
    return [...templates].sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
  }, [templates]);

  return (
    <div className="space-y-6">
      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-3">Create New Product Template</h3>
        {categories.length === 0 && !loading ? (
          <p className="text-sm text-gray-400 dark:text-night-400">
            No categories yet — create one at Category Management first.
          </p>
        ) : (
          <form onSubmit={handleCreate}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-night-300 mb-1">Product Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Instagram Premium Accounts"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-night-300 mb-1">Category</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={INPUT_CLASS}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-night-300 mb-1">Price (₦)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="2500"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-night-300 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this product template…"
                  rows={2}
                  className={INPUT_CLASS}
                />
              </div>
            </div>
            {createError && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{createError}</p>}
            <button type="submit" disabled={creating} className="btn-primary btn-sm mt-3">
              {creating ? "Creating…" : "+ Create Template"}
            </button>
          </form>
        )}
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-4">Existing Product Templates</h3>

        {loading ? (
          <p className="text-sm text-gray-400 dark:text-night-400">Loading…</p>
        ) : loadError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-night-400">No product templates yet.</p>
        ) : (
          <div className="space-y-2">
            {rowError && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{rowError}</p>}
            {sorted.map((t) => (
              <div key={t.id} className="rounded-xl border border-gray-100 dark:border-night-700 p-4">
                {editingId === t.id ? (
                  <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        type="text"
                        value={editState.name}
                        onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
                        className={INPUT_CLASS}
                      />
                      <select
                        value={editState.categoryId}
                        onChange={(e) => setEditState((s) => ({ ...s, categoryId: e.target.value }))}
                        className={INPUT_CLASS}
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editState.priceNgn}
                        onChange={(e) => setEditState((s) => ({ ...s, priceNgn: e.target.value }))}
                        className={INPUT_CLASS}
                      />
                      <input
                        type="text"
                        value={editState.description}
                        onChange={(e) => setEditState((s) => ({ ...s, description: e.target.value }))}
                        placeholder="Description"
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => saveEdit(t.id)}
                        disabled={savingId === t.id}
                        className="btn-primary btn-sm flex items-center gap-1"
                      >
                        <Check size={14} /> Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="btn-secondary btn-sm flex items-center gap-1">
                        <X size={14} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{t.name}</span>
                        <span className="badge badge-neutral">{t.categoryName}</span>
                        <StockBadge count={t.stockCount} />
                        {t.archived && <span className="badge badge-neutral">Archived</span>}
                      </div>
                      <p className="text-xs text-gray-400 dark:text-night-400 mt-1 max-w-xl">
                        {t.description ? `${t.description} · ` : ""}₦{Number(t.price_ngn).toLocaleString("en-US")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => toggleFavorite(t)}
                        disabled={savingId === t.id}
                        title={t.favorite ? "Remove favorite" : "Mark favorite"}
                        className={`btn-secondary btn-sm flex items-center gap-1 ${t.favorite ? "text-amber-500" : ""}`}
                      >
                        <Star size={14} fill={t.favorite ? "currentColor" : "none"} /> Favorite
                      </button>
                      <button onClick={() => startEdit(t)} className="btn-secondary btn-sm flex items-center gap-1">
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        onClick={() => toggleArchived(t)}
                        disabled={savingId === t.id}
                        className="btn-secondary btn-sm flex items-center gap-1"
                      >
                        {t.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                        {t.archived ? "Unarchive" : "Archive"}
                      </button>
                      <button onClick={() => setPendingDelete(t)} className="btn-danger btn-sm flex items-center gap-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        danger
        title={`Delete "${pendingDelete?.name}"?`}
        message="This deletes this template and any unsold uploaded accounts under it. If accounts have already been sold, deletion will be blocked; archive the template instead to take it off sale."
        confirmLabel="Yes, delete it"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
