import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
    .select("id, name, description, price_ngn, archived")
    .eq("id", params.templateId)
    .maybeSingle();
  if (!template || template.archived) notFound();

  const { count: availableCount } = await admin
    .from("digital_stock_items")
    .select("id", { count: "exact", head: true })
    .eq("template_id", template.id)
    .eq("status", "available");

  const requestedQty = Number(searchParams?.qty);
  const initialQuantity = Number.isInteger(requestedQty) && requestedQty > 0 ? requestedQty : "";

  return (
    <div className="max-w-lg">
      <Link
        href="/digital-accounts"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-night-400 hover:text-gray-800 dark:hover:text-night-100 mb-4"
      >
        <ArrowLeft size={16} /> Back
      </Link>

      <h1 className="text-xl font-bold mb-5">Checkout</h1>

      <DigitalAccountsCheckoutForm
        template={{
          id: template.id,
          name: template.name,
          description: template.description,
          priceNgn: Number(template.price_ngn),
          availableCount: availableCount || 0,
          walletBalanceNgn: Number(profile?.balance || 0),
        }}
        initialQuantity={initialQuantity}
      />
    </div>
  );
}
