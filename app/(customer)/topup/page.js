import { getSessionProfile } from "@/lib/auth";
import PocketfiFundForm from "@/components/PocketfiFundForm";
import PocketfiPaymentsList from "@/components/PocketfiPaymentsList";

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

  const { data: payments } = await supabase
    .from("payment_transactions")
    .select("*")
    .eq("provider", "pocketfi")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">Top Up</h1>
        <p className="text-sm text-gray-400 mt-1">Fund your wallet instantly by card, bank transfer, or mobile wallet.</p>
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
    </div>
  );
}
