import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminOverviewPage() {
  const admin = createAdminClient();

  const [{ data: profiles }, { data: rentals }, { data: services }] = await Promise.all([
    admin.from("profiles").select("balance"),
    admin.from("rentals").select("status, is_long_term"),
    admin.from("services").select("enabled"),
  ]);

  const totalUsers = profiles?.length || 0;
  const totalBalance = (profiles || []).reduce((sum, p) => sum + Number(p.balance || 0), 0);
  const waitingRentals = (rentals || []).filter((r) => r.status === "waiting").length;
  const longTermRentals = (rentals || []).filter((r) => r.is_long_term).length;
  const enabledServices = (services || []).filter((s) => s.enabled).length;

  return (
    <div>
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
          <div className="text-3xl font-bold">₦{totalBalance.toLocaleString()}</div>
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
          <div className="text-3xl font-bold">{rentals?.length || 0}</div>
        </div>
      </div>
    </div>
  );
}
