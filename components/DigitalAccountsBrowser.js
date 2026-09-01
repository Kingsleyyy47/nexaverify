"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Star, ShoppingCart } from "lucide-react";

const INPUT_CLASS =
  "w-20 rounded-lg border border-gray-200 dark:border-night-600 dark:bg-night-950 dark:text-night-100 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900";

// Category tabs -> product template grid -> buy. Live stock counts come from
// /api/digital-accounts/templates (computed server-side against
// digital_stock_items, which has no client-facing select policy at all — see
// schema.sql), so "Out of stock" always reflects the real, current count
// rather than something cached on the template row.
export default function DigitalAccountsBrowser() {
  const router = useRouter();
  const [categories, setCategories] = useState(null);
  const [categoryId, setCategoryId] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [quantities, setQuantities] = useState({});
  const [buyingId, setBuyingId] = useState(null);
  const [buyError, setBuyError] = useState("");

  useEffect(() => {
    async function loadCategories() {
      setLoadingCategories(true);
      setLoadError("");
      try {
        const res = await fetch("/api/digital-accounts/categories");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load categories.");
        setCategories(data.categories || []);
        if (data.categories?.length) setCategoryId(data.categories[0].id);
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoadingCategories(false);
      }
    }
    loadCategories();
  }, []);

  useEffect(() => {
    if (!categoryId) return;
    async function loadTemplates() {
      setLoadingTemplates(true);
      setLoadError("");
      try {
        const res = await fetch(`/api/digital-accounts/templates?categoryId=${categoryId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load products.");
        setTemplates(data.templates || []);
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoadingTemplates(false);
      }
    }
    loadTemplates();
  }, [categoryId]);

  const activeCategory = useMemo(() => categories?.find((c) => c.id === categoryId), [categories, categoryId]);

  function quantityFor(templateId) {
    return quantities[templateId] ?? 1;
  }

  function setQuantity(templateId, value, max) {
    const n = Math.max(1, Math.min(Number(value) || 1, Math.max(max, 1)));
    setQuantities((q) => ({ ...q, [templateId]: n }));
  }

  async function handleBuy(template) {
    setBuyError("");
    const qty = quantityFor(template.id);
    if (qty > template.availableCount) {
      setBuyError("Not enough stock left for that quantity.");
      return;
    }
    setBuyingId(template.id);
    try {
      const res = await fetch("/api/digital-accounts/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not complete the purchase.");
      router.push(`/digital-accounts/orders/${data.order.id}`);
    } catch (err) {
      setBuyError(err.message);
      setBuyingId(null);
    }
  }

  if (loadingCategories) {
    return <p className="text-sm text-gray-400 dark:text-night-400">Loading categories…</p>;
  }

  if (loadError && !categories) {
    return <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>;
  }

  if (!categories || categories.length === 0) {
    return (
      <div className="card card-pad text-sm text-gray-500 dark:text-night-400">
        No products available yet — check back soon.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-5">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryId(c.id)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition ${
              categoryId === c.id
                ? "bg-brand-600 text-white"
                : "bg-gray-100 dark:bg-night-800 text-gray-500 dark:text-night-300 hover:bg-gray-200 dark:hover:bg-night-700"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {activeCategory?.description && (
        <p className="text-sm text-gray-400 dark:text-night-400 mb-4">{activeCategory.description}</p>
      )}

      {buyError && <p className="text-sm text-red-600 dark:text-red-400 mb-4">{buyError}</p>}

      {loadingTemplates ? (
        <p className="text-sm text-gray-400 dark:text-night-400">Loading products…</p>
      ) : !templates || templates.length === 0 ? (
        <div className="card card-pad text-sm text-gray-500 dark:text-night-400">
          No products in this category yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const outOfStock = t.availableCount <= 0;
            return (
              <div key={t.id} className="card card-pad flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="font-bold text-sm flex items-center gap-1.5">
                    {t.favorite && <Star size={14} fill="currentColor" className="text-amber-400 shrink-0" />}
                    {t.name}
                  </div>
                  <span className={`badge ${outOfStock ? "badge-danger" : "badge-success"} shrink-0`}>
                    {outOfStock ? "Out of stock" : `${t.availableCount} in stock`}
                  </span>
                </div>
                {t.description && (
                  <p className="text-xs text-gray-400 dark:text-night-400 mb-3 flex-1">{t.description}</p>
                )}
                <div className="text-lg font-bold mb-3">₦{Number(t.price_ngn).toLocaleString("en-US")}</div>

                {outOfStock ? (
                  <button disabled className="btn-secondary w-full opacity-50 cursor-not-allowed">
                    Out of stock
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={t.availableCount}
                      value={quantityFor(t.id)}
                      onChange={(e) => setQuantity(t.id, e.target.value, t.availableCount)}
                      className={INPUT_CLASS}
                    />
                    <button
                      onClick={() => handleBuy(t)}
                      disabled={buyingId === t.id}
                      className="btn-primary flex-1 flex items-center justify-center gap-1.5"
                    >
                      <ShoppingCart size={14} />
                      {buyingId === t.id ? "Buying…" : "Buy"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
