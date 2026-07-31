import { getSessionProfile } from "@/lib/auth";
import TransactionsTable from "@/components/TransactionsTable";

export default async function HistoryPage() {
  const { supabase } = await getSessionProfile();

  const { data: transactions } = await supabase
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">History</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">Every wallet transaction, in order.</p>
      </div>

      <div className="card card-pad">
        <TransactionsTable transactions={transactions} />
      </div>
    </div>
  );
}
