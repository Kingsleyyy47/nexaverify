import { getSessionProfile, isAdmin } from "@/lib/auth";
import TelegramGiftBuyForm from "@/components/TelegramGiftBuyForm";

// Deliberately gated on role, NOT on istar_config.enabled — every customer
// sees "Coming soon" here no matter what, and only an admin ever sees the
// real purchase flow (to test it end-to-end with their own wallet). See
// public.istar_config in schema.sql for why this is not the same pattern as
// every other provider on this site.
export default async function TelegramPremiumPage() {
  const { profile } = await getSessionProfile();

  if (!isAdmin(profile)) {
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
          Admin test view — customers currently see this as "Coming soon." Purchases here debit
          your own wallet balance, exactly like a real customer purchase would.
        </p>
      </div>
      <TelegramGiftBuyForm />
    </div>
  );
}
