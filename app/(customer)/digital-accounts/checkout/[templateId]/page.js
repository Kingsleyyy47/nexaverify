import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import DigitalAccountsCheckoutForm from "@/components/DigitalAccountsCheckoutForm";

// Dedicated checkout step for a single Digital Accounts product — Buy Now on
// the card (DigitalAccountsBrowser.js) lands here instead of buying
// instantly, so the customer sees the full description and picks a quantity
// on its own screen before paying. The checkout form keeps them on this page
// and opens the purchased credentials in a modal immediately; the permanent
// order record remains available from /history afterward.
export default async function DigitalAccountsCheckoutPage({ params, searchParams }) {
  const { user, profile } = await getSessionProfile();
  if (!user) notFound();

  const admin = createAdminClient();

  // Same "Coming soon" gate as /digital-accounts itself and every API route
  // behind it — see app/api/digital-accounts/categories/route.js's comment
  // for why this is re-checked on every entry point rather than trusted from
  // one place.
  if (!isAdmin(profile)) {
    const { data: config } = await admin
      .from("digital_accounts_config")
      .select("customer_visible")
      .eq("id", true)
      .maybeSingle();
    if (!config?.customer_visible) notFound();
  }

  const { data: template } = await admin
    .from("digital_product_templates")
    .select("id, category_id, name, description, price_ngn, archived")
    .eq("id", params.templateId)
    .maybeSingle();
  if (!template || template.archived) notFound();

  const { data: category } = await admin
    .from("digital_categories")
    .select("id, name, description, logo_url, logo_url_dark")
    .eq("id", template.category_id)
    .maybeSingle();

  const { count: availableCount } = await admin
    .from("digital_stock_items")
    .select("id", { count: "exact", head: true })
    .eq("template_id", template.id)
    .eq("status", "available");

  const requestedQty = Number(searchParams?.qty);
  const initialQuantity = Number.isInteger(requestedQty) && requestedQty > 0 ? requestedQty : "";

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/digital-accounts"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 dark:text-night-400 dark:hover:text-night-100"
        >
          <ArrowLeft size={16} /> Back to products
        </Link>

        <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-brand-700 dark:border-night-700 dark:bg-night-900 dark:text-brand-300">
          <ShoppingBag size={14} /> Digital checkout
        </div>
      </div>

      <DigitalAccountsCheckoutForm
        template={{
          id: template.id,
          name: template.name,
          description: template.description,
          categoryName: category?.name || "Digital account",
          logoUrl: category?.logo_url || "",
          logoUrlDark: category?.logo_url_dark || "",
          priceNgn: Number(template.price_ngn),
          availableCount: availableCount || 0,
          walletBalanceNgn: Number(profile?.balance || 0),
        }}
        initialQuantity={initialQuantity}
      />
    </div>
  );
}
