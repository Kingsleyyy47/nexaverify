import { redirect } from "next/navigation";
import { fetchAllRows } from "@/lib/supabase/fetchAllRows";
import { getSessionProfile } from "@/lib/auth";
import CustomerHistorySections from "@/components/CustomerHistorySections";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function HistoryPage() {
  const { user } = await getSessionProfile();
  if (!user) redirect("/login");
  const admin = createAdminClient();

  const [
    rentals,
    digitalOrders,
    telegramOrders,
    socialBoostOrders,
    transactions,
  ] = await Promise.all([
    fetchAllRows(() => admin.from("rentals").select("*").eq("user_id", user.id), "id"),
    fetchAllRows(() => admin.from("digital_orders").select("*").eq("user_id", user.id), "id"),
    fetchAllRows(() => admin.from("telegram_gift_orders").select("*").eq("user_id", user.id), "id"),
    fetchAllRows(() => admin.from("social_boost_orders").select("*").eq("user_id", user.id), "id"),
    fetchAllRows(() => admin.from("transactions").select("*").eq("user_id", user.id), "id"),
  ]);

  for (const rows of [rentals, digitalOrders, telegramOrders, socialBoostOrders, transactions]) {
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

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
