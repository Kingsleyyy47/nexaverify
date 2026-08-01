import { getSessionProfile } from "@/lib/auth";
import TopupForm from "@/components/TopupForm";
import PocketfiFundForm from "@/components/PocketfiFundForm";
import PocketfiPaymentsList from "@/components/PocketfiPaymentsList";

const STATUS_BADGE = {
  pending: "badge-warning",
  approved: "badge-success",
  rejected: "badge-danger",
};

const FUNDED_BANNER = {
  success: {
    className: "border-brand-200 dark:border-brand-900 bg-brand-50/50 dark:bg-brand-950/20 text-brand-800 dark:text-brand-300",
    text: "Payment received — your wallet has been credited.",
  },
  pending: {
    className: "border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300",
    text: "Payment is still processing. Use \"Check status\" below once it's done, or it'll be picked up automatically.",
  },
  failed: {
    className: "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 text-red-700 dark:text-red-400",
    text: "That payment didn't go through. No amount was charged to your wallet.",
  },
  error: {
    className: "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 text-red-700 dark:text-red-400",
    text: "Something went wrong confirming that payment. Try \"Check status\" below.",
  },
};

export default async function TopupPage({ searchParams }) {
  const { supabase } = await getSessionProfile();
  const funded = searchParams?.funded;
  const banner = funded ? FUNDED_BANNER[funded] : null;

  const [{ data: requests }, { data: payments }] = await Promise.all([
    supabase.from("topup_requests").select("*").order("created_at", { ascending: false }),
    supabase
      .from("payment_transactions")
      .select("*")
      .eq("provider", "pocketfi")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">Top Up</h1>
        <p className="text-sm text-gray-400 mt-1">Fund your wallet instantly, or request a manual top-up.</p>
      </div>

      {banner && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${banner.className}`}>
          {banner.text}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 items-start">
        <div className="card card-pad">
          <h3 className="font-bold text-[15px] mb-4">Fund instantly</h3>
          <PocketfiFundForm />
        </div>

        <div className="card card-pad">
          <h3 className="font-bold text-[15px] mb-4">Instant funding history</h3>
          <PocketfiPaymentsList payments={payments || []} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 items-start">
        <div className="card card-pad">
          <h3 className="font-bold text-[15px] mb-4">Manual top-up request</h3>
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
