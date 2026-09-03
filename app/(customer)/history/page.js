import { getSessionProfile } from "@/lib/auth";
import CustomerHistorySections from "@/components/CustomerHistorySections";

export default async function HistoryPage() {
  const { supabase } = await getSessionProfile();

  const [
    { data: rentals },
    { data: digitalOrders },
    { data: telegramOrders },
    { data: socialBoostOrders },
    { data: transactions },
  ] = await Promise.all([
    supabase.from("rentals").select("*").order("created_at", { ascending: false }),
    supabase.from("digital_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("telegram_gift_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("social_boost_orders").select("*").order("created_at", { ascending: false }),
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

      <CustomerHistorySections
        rentals={rentals || []}
        digitalOrders={digitalOrders || []}
        telegramOrders={telegramOrders || []}
        socialBoostOrders={socialBoostOrders || []}
        transactions={transactions || []}
      />
    </div>
  );
}
