import { getSessionProfile } from "@/lib/auth";
import CustomerHistorySections from "@/components/CustomerHistorySections";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function HistoryPage() {
  const { user } = await getSessionProfile();
  const admin = createAdminClient();

  const [
    { data: rentals },
    { data: digitalOrders },
    { data: telegramOrders },
    { data: socialBoostOrders },
    { data: transactions },
  ] = await Promise.all([
    admin.from("rentals").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    admin.from("digital_orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    admin.from("telegram_gift_orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    admin.from("social_boost_orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    admin.from("transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
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
