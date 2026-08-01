import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import TransactionsTable from "@/components/TransactionsTable";
import WalletBalanceCard from "@/components/WalletBalanceCard";

export default async function DashboardPage() {
  const { profile, supabase } = await getSessionProfile();

  const [{ data: transactions }, { data: activeRentals }] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("rentals")
      .select("*")
      .eq("status", "waiting")
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

      <div className="grid md:grid-cols-3 gap-5 mb-7 items-stretch">
        <div className="md:col-span-1">
          <WalletBalanceCard balance={profile?.balance || 0} />
        </div>

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

        <div className="card card-pad">
          <div className="text-sm text-gray-500 dark:text-night-400 font-semibold mb-2">
            Browse products
          </div>
          <p className="text-xs text-gray-400 dark:text-night-400 mb-2">
            See what services are available and their prices in Naira.
          </p>
          <Link
            href="/products"
            className="text-xs font-semibold text-brand-700 dark:text-brand-400 mt-2 inline-block"
          >
            Go to Products →
          </Link>
        </div>
      </div>

      <div className="card card-pad">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[15px]">Recent transactions</h3>
          <Link href="/history" className="text-xs font-semibold text-brand-700 dark:text-brand-400">
            View all →
          </Link>
        </div>
        <TransactionsTable transactions={transactions} />
      </div>
    </div>
  );
}
