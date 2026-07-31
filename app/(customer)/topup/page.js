import { getSessionProfile } from "@/lib/auth";
import TopupForm from "@/components/TopupForm";

const STATUS_BADGE = {
  pending: "badge-warning",
  approved: "badge-success",
  rejected: "badge-danger",
};

export default async function TopupPage() {
  const { supabase } = await getSessionProfile();

  const { data: requests } = await supabase
    .from("topup_requests")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">Top Up</h1>
        <p className="text-sm text-gray-400 mt-1">Request funds to be added to your wallet.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 items-start">
        <div className="card card-pad">
          <TopupForm />
        </div>

        <div className="card card-pad">
          <h3 className="font-bold text-[15px] mb-4">Your requests</h3>
          <div className="space-y-3">
            {(requests || []).length === 0 && (
              <p className="text-sm text-gray-400 dark:text-night-400">No top-up requests yet.</p>
            )}
            {(requests || []).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between border-b border-gray-50 dark:border-night-700 last:border-0 pb-3 last:pb-0"
              >
                <div>
                  <div className="font-semibold text-sm">₦{Number(r.amount_ngn).toLocaleString()}</div>
                  <div className="text-xs text-gray-400 dark:text-night-400">
                    {new Date(r.created_at).toLocaleString()}
                    {r.note ? ` · ${r.note}` : ""}
                  </div>
                </div>
                <span className={`badge ${STATUS_BADGE[r.status] || "badge-neutral"}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
