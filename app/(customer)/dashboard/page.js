import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import WalletBalanceCard from "@/components/WalletBalanceCard";
import QuickBuyList from "@/components/QuickBuyList";
import NumberCard from "@/components/NumberCard";

export default async function DashboardPage() {
  const { profile, supabase } = await getSessionProfile();

  const [{ data: services }, { data: activeRentals }] = await Promise.all([
    supabase
      .from("services")
      .select("*")
      .eq("enabled", true)
      .not("customer_price", "is", null)
      // Favorited products (toggled in /admin/products) sort to the top of
      // this same list — not a separate section — everything else stays
      // alphabetical after them.
      .order("favorite", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("rentals")
      .select("*")
      .in("status", ["waiting", "received"])
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-7">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">Your wallet and recent activity.</p>
        </div>
        <Link href="/products" className="btn-primary">
          + Buy a number
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 gap-5 mb-7 items-stretch">
        <WalletBalanceCard balance={profile?.balance || 0} />

        <div className="card card-pad">
          <div className="text-sm text-gray-500 dark:text-night-400 font-semibold mb-2">
            Active rentals
          </div>
          <div className="text-3xl font-bold">{activeRentals?.length || 0}</div>
          <Link
            href="/rentals"
            className="text-xs font-semibold text-brand-700 dark:text-brand-400 mt-2 inline-block"
          >
            View rentals →
          </Link>
        </div>
      </div>

      <div className="mb-7">
        <QuickBuyList services={services || []} />
      </div>

      <div>
        <h3 className="font-bold text-[15px] mb-3">Your numbers</h3>
        {(activeRentals || []).length === 0 ? (
          <div className="card card-pad text-sm text-gray-400 dark:text-night-400">
            No active numbers yet — buy one above and it&apos;ll show up here with its code.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {activeRentals.map((r) => (
              <NumberCard key={r.id} rental={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
