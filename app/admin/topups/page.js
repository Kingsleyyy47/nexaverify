import { createAdminClient } from "@/lib/supabase/admin";
import TopupRequestRow from "@/components/TopupRequestRow";

export default async function AdminTopupsPage() {
  const admin = createAdminClient();

  const { data: requests } = await admin
    .from("topup_requests")
    .select("*")
    .order("created_at", { ascending: false });

  const userIds = [...new Set((requests || []).map((r) => r.user_id))];
  const { data: users } =
    userIds.length > 0
      ? await admin.from("profiles").select("id, email").in("id", userIds)
      : { data: [] };
  const emailById = new Map((users || []).map((u) => [u.id, u.email]));

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Top-up requests</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          Approve credits the customer's wallet immediately; reject just closes the request.
        </p>
      </div>

      <div className="card card-pad">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 border-b border-gray-100 dark:border-night-700">
                <th className="pb-2.5 font-bold">User</th>
                <th className="pb-2.5 font-bold">Amount</th>
                <th className="pb-2.5 font-bold">Note</th>
                <th className="pb-2.5 font-bold">Requested</th>
                <th className="pb-2.5 font-bold">Status</th>
                <th className="pb-2.5 font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {(requests || []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-400 dark:text-night-400">
                    No top-up requests yet.
                  </td>
                </tr>
              )}
              {(requests || []).map((r) => (
                <TopupRequestRow key={r.id} request={r} userEmail={emailById.get(r.user_id) || r.user_id} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
