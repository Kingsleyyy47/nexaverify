import { createAdminClient } from "@/lib/supabase/admin";
import AdminProductHistory from "@/components/AdminProductHistory";

const RECENT_LIMIT = 300;

// Every purchase ever made, across every kind of product NexaVerify sells,
// in one place — grouped into a closeable dropdown per category (see
// components/AdminProductHistory.js) rather than one giant flat table.
// SMS rentals, number history, and deposits already have their own
// dedicated (paginated, searchable) admin pages; digital accounts and
// social boost never had one at all until now. What's genuinely new here,
// for every category alike, is the "Details" button — it reveals the
// actual thing the customer walked away with (the real account
// credentials for a digital account, the phone number + received code for
// a rental, etc.), not just a summary row.
export default async function AdminProductHistoryPage() {
  const admin = createAdminClient();

  const [{ data: rentals }, { data: digitalOrders }, { data: telegramOrders }, { data: socialBoostOrders }] =
    await Promise.all([
      admin.from("rentals").select("*").order("created_at", { ascending: false }).limit(RECENT_LIMIT),
      admin.from("digital_orders").select("*").order("created_at", { ascending: false }).limit(RECENT_LIMIT),
      admin
        .from("telegram_gift_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT),
      admin
        .from("social_boost_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT),
    ]);

  const userIds = [
    ...new Set(
      [
        ...(rentals || []).map((r) => r.user_id),
        ...(digitalOrders || []).map((o) => o.user_id),
        ...(telegramOrders || []).map((o) => o.user_id),
        ...(socialBoostOrders || []).map((o) => o.user_id),
      ].filter(Boolean)
    ),
  ];
  const { data: users } =
    userIds.length > 0
      ? await admin.from("profiles").select("id, username, email").in("id", userIds)
      : { data: [] };
  const userById = new Map((users || []).map((u) => [u.id, u]));

  function buyerName(userId) {
    const u = userById.get(userId);
    return u?.username || u?.email || userId || "—";
  }

  const rentalsWithBuyer = (rentals || []).map((r) => ({ ...r, buyerName: buyerName(r.user_id) }));
  const digitalOrdersWithBuyer = (digitalOrders || []).map((o) => ({ ...o, buyerName: buyerName(o.user_id) }));
  const telegramOrdersWithBuyer = (telegramOrders || []).map((o) => ({ ...o, buyerName: buyerName(o.user_id) }));
  const socialBoostOrdersWithBuyer = (socialBoostOrders || []).map((o) => ({
    ...o,
    buyerName: buyerName(o.user_id),
  }));

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Product history</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          Every purchase across every product, grouped by type. Showing the most recent{" "}
          {RECENT_LIMIT.toLocaleString("en-US")} per category — for full paginated/searchable views of
          SMS rentals or deposits specifically, use Number history or Transactions instead.
        </p>
      </div>

      <AdminProductHistory
        rentals={rentalsWithBuyer}
        digitalOrders={digitalOrdersWithBuyer}
        telegramOrders={telegramOrdersWithBuyer}
        socialBoostOrders={socialBoostOrdersWithBuyer}
      />
    </div>
  );
}
