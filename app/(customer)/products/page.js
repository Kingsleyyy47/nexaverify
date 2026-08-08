import { getSessionProfile } from "@/lib/auth";
import BuyForm from "@/components/BuyForm";

export default async function ProductsPage() {
  const { supabase } = await getSessionProfile();

  const { data: providerConfig } = await supabase
    .from("daisysms_config")
    .select("enabled")
    .eq("id", true)
    .maybeSingle();
  // Fails open (missing row = enabled) so an un-migrated install isn't
  // silently broken — same reasoning as /api/rentals/buy.
  const enabled = providerConfig?.enabled ?? true;

  if (!enabled) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">USA &amp; Canada</h1>
        <div className="card card-pad text-sm text-gray-500 dark:text-night-400">
          This product isn&apos;t available right now — check back soon.
        </div>
      </div>
    );
  }

  // Only show products that are both switched on AND have a customer price
  // set by the admin — an enabled-but-unpriced product isn't purchasable yet.
  // Favorited products (toggled in /admin/products) sort to the top of this
  // same list — not a separate section — everything else stays alphabetical
  // after them.
  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("enabled", true)
    .not("customer_price", "is", null)
    .order("favorite", { ascending: false })
    .order("name", { ascending: true });

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Products</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          Pick a service — the number is rented instantly from your wallet balance.
        </p>
      </div>

      <BuyForm services={services || []} />
    </div>
  );
}
