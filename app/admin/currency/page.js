import { createAdminClient } from "@/lib/supabase/admin";
import CurrencyRateForm from "@/components/CurrencyRateForm";
import LiveRateSyncButton from "@/components/LiveRateSyncButton";

export default async function AdminCurrencyPage() {
  const admin = createAdminClient();
  const { data: rows } = await admin.from("currency_rates").select("*");

  const rates = {};
  for (const currency of ["USD", "GBP", "EUR"]) {
    const row = (rows || []).find((r) => r.currency === currency);
    rates[currency] = {
      ngnPerUnit: row?.ngn_per_unit ?? null,
      autoNgnPerUnit: row?.auto_ngn_per_unit ?? null,
      manualOverride: Boolean(row?.manual_override),
      updatedAt: row?.updated_at ?? null,
    };
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-7">
        <div>
          <h1 className="text-2xl font-bold">Currency rates</h1>
          <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
            NexaVerify is priced and billed entirely in Naira. These rates only affect what
            customers see when they switch the currency switcher, and how DaisySMS's USD
            long-term rental fees get converted into what's charged to a wallet. "Live" pulls a
            free public exchange rate automatically; "Custom" lets you fix a number by hand that
            won't change until you switch back to Live.
          </p>
        </div>
        <LiveRateSyncButton />
      </div>

      <div className="card card-pad">
        <CurrencyRateForm rates={rates} />
      </div>
    </div>
  );
}
