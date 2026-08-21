import { getSessionProfile, isAdmin } from "@/lib/auth";
import TelegramGiftBuyForm from "@/components/TelegramGiftBuyForm";

// Admins always see the real buy flow here (to test it end-to-end with their
// own wallet), gated only by istar_config.enabled in the API routes.
// Everyone else additionally needs istar_config.customer_visible — a
// SEPARATE, off-by-default switch from `enabled`, flipped on at
// /admin/telegram-premium only once you're happy with testing. See that
// column's comment in schema.sql for the reasoning.
export default async function TelegramPremiumPage() {
  const { profile, supabase } = await getSessionProfile();
  const admin = isAdmin(profile);

  let customerVisible = false;
  if (!admin) {
    const { data: config } = await supabase.from("istar_config").select("customer_visible").eq("id", true).maybeSingle();
    customerVisible = Boolean(config?.customer_visible);
  }

  if (!admin && !customerVisible) {
    return (
      <div>
        <div className="mb-7">
          <h1 className="text-2xl font-bold">Telegram Premium</h1>
          <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
            Gift Telegram Stars and Telegram Premium subscriptions.
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
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Telegram Premium</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          {admin && !customerVisible
            ? 'Admin test view — customers currently see this as "Coming soon" until you flip on customer visibility in admin settings. Purchases here debit your own wallet balance, exactly like a real customer purchase would.'
            : "Gift Telegram Stars and Telegram Premium subscriptions — paid straight from your wallet balance."}
        </p>
      </div>
      <TelegramGiftBuyForm isAdminView={admin} />
    </div>
  );
}
