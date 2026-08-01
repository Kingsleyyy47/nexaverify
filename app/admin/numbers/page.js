import { createAdminClient } from "@/lib/supabase/admin";
import SyncLtrsButton from "@/components/SyncLtrsButton";

export default async function AdminNumbersPage() {
  const admin = createAdminClient();

  const { data: rentals } = await admin
    .from("rentals")
    .select("*")
    .eq("is_long_term", true)
    .order("created_at", { ascending: false });

  const userIds = [...new Set((rentals || []).map((r) => r.user_id))];
  const { data: users } =
    userIds.length > 0
      ? await admin.from("profiles").select("id, email").in("id", userIds)
      : { data: [] };

  const emailById = new Map((users || []).map((u) => [u.id, u.email]));

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-7">
        <div>
          <h1 className="text-2xl font-bold">Long-term numbers</h1>
          <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
            Every number held for repeated/long-term use, across all customers, in one place.
          </p>
        </div>
        <SyncLtrsButton />
      </div>

      <div className="card card-pad">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 border-b border-gray-100 dark:border-night-700">
                <th className="pb-2.5 font-bold">Number</th>
                <th className="pb-2.5 font-bold">Service</th>
                <th className="pb-2.5 font-bold">Owner</th>
                <th className="pb-2.5 font-bold">Status</th>
                <th className="pb-2.5 font-bold">Last code</th>
                <th className="pb-2.5 font-bold">Paid until</th>
                <th className="pb-2.5 font-bold">Auto-renew</th>
                <th className="pb-2.5 font-bold">Purchased</th>
              </tr>
            </thead>
            <tbody>
              {(rentals || []).length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-gray-400 dark:text-night-400">
                    No long-term numbers yet.
                  </td>
                </tr>
              )}
              {(rentals || []).map((r) => (
                <tr key={r.id} className="border-b border-gray-50 dark:border-night-700 last:border-0">
                  <td className="py-3.5 font-mono">{r.phone_number}</td>
                  <td className="py-3.5">{r.service_id}</td>
                  <td className="py-3.5 text-gray-500 dark:text-night-400">
                    {emailById.get(r.user_id) || r.user_id}
                  </td>
                  <td className="py-3.5 capitalize">{r.status}</td>
                  <td className="py-3.5 font-mono">{r.sms_code || "—"}</td>
                  <td className="py-3.5 text-gray-500 dark:text-night-400">
                    {r.paid_until ? new Date(r.paid_until).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-3.5">{r.auto_renew ? "On" : "Off"}</td>
                  <td className="py-3.5 text-gray-400 dark:text-night-400">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 dark:text-night-400 mt-4">
          Paid-until dates and auto-renew status come from DaisySMS&apos;s own records — click
          &quot;Sync LTRs&quot; above to refresh them.
        </p>
      </div>
    </div>
  );
}
