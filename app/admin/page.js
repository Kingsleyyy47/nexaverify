import { createAdminClient } from "@/lib/supabase/admin";
import AdminOverviewAutoRefresh from "@/components/AdminOverviewAutoRefresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 1000;

async function fetchAllProfileBalances(admin) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("profiles")
      .select("balance")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

export default async function AdminOverviewPage() {
  const admin = createAdminClient();

  const [
    { count: totalUsers },
    profiles,
    { count: waitingRentals },
    { count: longTermRentals },
    { count: totalRentals },
    { count: enabledServices },
  ] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    fetchAllProfileBalances(admin),
    admin.from("rentals").select("id", { count: "exact", head: true }).eq("status", "waiting"),
    admin.from("rentals").select("id", { count: "exact", head: true }).eq("is_long_term", true),
    admin.from("rentals").select("id", { count: "exact", head: true }),
    admin.from("services").select("id", { count: "exact", head: true }).eq("enabled", true),
  ]);

  const totalBalance = (profiles || []).reduce((sum, p) => sum + Number(p.balance || 0), 0);

  return (
    <div>
      <AdminOverviewAutoRefresh />

      <div className="mb-7">
        <h1 className="text-2xl font-bold">Admin overview</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">A quick snapshot of NexaVerify.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <div className="card card-pad">
          <div className="text-sm text-gray-500 dark:text-night-400 font-semibold mb-2">Total users</div>
          <div className="text-3xl font-bold">{totalUsers}</div>
        </div>
        <div className="card card-pad">
          <div className="text-sm text-gray-500 dark:text-night-400 font-semibold mb-2">Total wallet balances held</div>
          <div className="text-3xl font-bold">₦{totalBalance.toLocaleString("en-US")}</div>
        </div>
        <div className="card card-pad">
          <div className="text-sm text-gray-500 dark:text-night-400 font-semibold mb-2">Enabled services</div>
          <div className="text-3xl font-bold">{enabledServices}</div>
        </div>
        <div className="card card-pad">
          <div className="text-sm text-gray-500 dark:text-night-400 font-semibold mb-2">Rentals waiting for SMS</div>
          <div className="text-3xl font-bold">{waitingRentals}</div>
        </div>
        <div className="card card-pad">
          <div className="text-sm text-gray-500 dark:text-night-400 font-semibold mb-2">Long-term numbers held</div>
          <div className="text-3xl font-bold">{longTermRentals}</div>
        </div>
        <div className="card card-pad">
          <div className="text-sm text-gray-500 dark:text-night-400 font-semibold mb-2">Total rentals ever</div>
          <div className="text-3xl font-bold">{totalRentals || 0}</div>
        </div>
      </div>
    </div>
  );
}
