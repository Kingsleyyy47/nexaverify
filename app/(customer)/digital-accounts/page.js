import Link from "next/link";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import DigitalAccountsBrowser from "@/components/DigitalAccountsBrowser";

// Admins always see the real catalog here (so you can check your own
// categories/templates/stock as you build them); everyone else additionally
// needs digital_accounts_config.customer_visible — off by default, same
// two-tier gate as Telegram Premium / Social Boost (see istar_config's
// comment in schema.sql for the original reasoning), just without a
// separate "enabled" switch since there's no external provider here to test
// against — see public.digital_accounts_config's own comment for why.
export default async function DigitalAccountsPage() {
  const { profile, supabase } = await getSessionProfile();
  const admin = isAdmin(profile);

  const { data: config } = await supabase
    .from("digital_accounts_config")
    .select("customer_visible")
    .eq("id", true)
    .maybeSingle();
  const customerVisible = Boolean(config?.customer_visible);

  if (!admin && !customerVisible) {
    return (
      <div>
        <div className="mb-7">
          <h1 className="text-2xl font-bold">Digital Accounts</h1>
          <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
            Ready-made accounts, delivered instantly.
          </p>
        </div>
        <div className="card card-pad text-sm text-gray-500 dark:text-night-400">
          Coming soon — check back later.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-7">
        <div>
          <h1 className="text-2xl font-bold">Digital Accounts</h1>
          <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
            {admin && !customerVisible
              ? 'Admin view — customers currently see this as "Coming soon" until you turn on customer visibility in admin settings. Purchases here debit your own wallet balance, exactly like a real customer purchase would.'
              : "Pick a category, choose a product, and check out from your wallet balance."}
          </p>
        </div>
        <Link
          href="/digital-accounts/orders"
          className="text-xs font-semibold text-brand-700 dark:text-brand-400 shrink-0 whitespace-nowrap mt-1"
        >
          Your orders →
        </Link>
      </div>
      <DigitalAccountsBrowser />
    </div>
  );
}
