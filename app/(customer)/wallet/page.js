import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import WalletBalanceCard from "@/components/WalletBalanceCard";
import TransactionsTable from "@/components/TransactionsTable";

export default async function WalletPage() {
  const { profile, supabase } = await getSessionProfile();

  const { data: transactions } = await supabase
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">Wallet</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          Your balance, shown in Naira and converted to other currencies for reference.
        </p>
      </div>

      <WalletBalanceCard balance={profile?.balance || 0} />

      <div className="card card-pad">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[15px]">Recent activity</h3>
          <Link href="/history" className="text-xs font-semibold text-brand-700 dark:text-brand-400">
            View all →
          </Link>
        </div>
        <TransactionsTable transactions={transactions} />
      </div>
    </div>
  );
}
