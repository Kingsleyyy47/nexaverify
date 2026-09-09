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

function StatCard({ label, value, todayLabel }) {
  return (
    <div className="card card-pad">
      <div className="text-sm text-gray-500 dark:text-night-400 font-semibold mb-2">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
      {todayLabel && (
        <div className="text-[11px] text-gray-400 dark:text-night-500 mt-1">{todayLabel}</div>
      )}
    </div>
  );
}

export default async function AdminOverviewPage() {
  const admin = createAdminClient();

  // "Today" here is a UTC calendar-day boundary — this is a Server Component,
  // so it has no way to know which timezone the admin viewing the page is
  // actually in (unlike the timestamps shown elsewhere on the site, which
  // now render client-side via components/LocalDateTime.js and so pick up
  // the real visitor timezone automatically). Good enough for a rough
  // "how much happened today" pulse rather than an exact per-viewer count.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const [
    { count: totalUsers },
    { count: usersToday },
    profiles,
    { count: waitingRentals },
    { count: waitingRentalsToday },
    { count: longTermRentals },
    { count: longTermRentalsToday },
    { count: totalRentals },
    { count: totalRentalsToday },
    { count: enabledServices },
    { count: enabledServicesToday },
    depositTotalRows,
    depositTodayRows,
  ] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
    fetchAllProfileBalances(admin),
    admin.from("rentals").select("id", { count: "exact", head: true }).eq("status", "waiting"),
    admin
      .from("rentals")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting")
      .gte("created_at", todayIso),
    admin.from("rentals").select("id", { count: "exact", head: true }).eq("is_long_term", true),
    admin
      .from("rentals")
      .select("id", { count: "exact", head: true })
      .eq("is_long_term", true)
      .gte("created_at", todayIso),
    admin.from("rentals").select("id", { count: "exact", head: true }),
    admin.from("rentals").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
    admin.from("services").select("id", { count: "exact", head: true }).eq("enabled", true),
    admin
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("enabled", true)
      .gte("created_at", todayIso),
    // Every deposit that's ever landed in a customer's wallet, from any
    // source (manual top-up approval, PocketFi checkout, PocketFi
    // virtual-account transfer) — all three write transactions.type='deposit'
    // via adjust_balance(), same ledger /admin/transactions reads. Admin
    // manual balance adjustments write type='admin_adjustment' instead (see
    // app/api/admin/users/[id]/adjust-balance/route.js), so filtering on
    // 'deposit' already excludes admin activity — nothing extra to subtract.
    admin.from("transactions").select("amount").eq("type", "deposit"),
    admin.from("transactions").select("amount").eq("type", "deposit").gte("created_at", todayIso),
  ]);

  const totalBalance = (profiles || []).reduce((sum, p) => sum + Number(p.balance || 0), 0);
  const totalDeposits = (depositTotalRows.data || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const depositsToday = (depositTodayRows.data || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return (
    <div>
      <AdminOverviewAutoRefresh />

      <div className="mb-7">
        <h1 className="text-2xl font-bold">Admin overview</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">A quick snapshot of NexaVerify.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <StatCard
          label="Total users"
          value={totalUsers}
          todayLabel={`+${usersToday || 0} today`}
        />
        <StatCard
          label="Total wallet balances held"
          value={`₦${totalBalance.toLocaleString("en-US")}`}
          todayLabel={`+₦${depositsToday.toLocaleString("en-US")} deposited today`}
        />
        <StatCard
          label="Total deposits (customers only)"
          value={`₦${totalDeposits.toLocaleString("en-US")}`}
          todayLabel={`+₦${depositsToday.toLocaleString("en-US")} today`}
        />
        <StatCard
          label="Enabled services"
          value={enabledServices}
          todayLabel={`+${enabledServicesToday || 0} added today`}
        />
        <StatCard
          label="Rentals waiting for SMS"
          value={waitingRentals}
          todayLabel={`+${waitingRentalsToday || 0} today`}
        />
        <StatCard
          label="Long-term numbers held"
          value={longTermRentals}
          todayLabel={`+${longTermRentalsToday || 0} today`}
        />
        <StatCard
          label="Total rentals ever"
          value={totalRentals || 0}
          todayLabel={`+${totalRentalsToday || 0} today`}
        />
      </div>
    </div>
  );
}
