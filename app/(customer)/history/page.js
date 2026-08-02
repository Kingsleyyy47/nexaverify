import { getSessionProfile } from "@/lib/auth";
import TransactionsTable from "@/components/TransactionsTable";
import OrderHistoryTable from "@/components/OrderHistoryTable";

export default async function HistoryPage() {
  const { supabase } = await getSessionProfile();

  const [{ data: orders }, { data: transactions }] = await Promise.all([
    supabase.from("rentals").select("*").order("created_at", { ascending: false }),
    supabase.from("transactions").select("*").order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-9">
      <div>
        <h1 className="text-2xl font-bold">History</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          Every order and wallet transaction, in order.
        </p>
      </div>

      <section>
        <h3 className="font-bold text-[15px] mb-3">Order history</h3>
        <div className="card card-pad">
          <OrderHistoryTable orders={orders} />
        </div>
      </section>

      <section>
        <h3 className="font-bold text-[15px] mb-3">Wallet transactions</h3>
        <div className="card card-pad">
          <TransactionsTable transactions={transactions} />
        </div>
      </section>
    </div>
  );
}
