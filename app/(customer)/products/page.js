import { getSessionProfile } from "@/lib/auth";
import BuyForm from "@/components/BuyForm";

export default async function ProductsPage() {
  const { supabase } = await getSessionProfile();

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
