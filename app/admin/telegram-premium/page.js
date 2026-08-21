import { createAdminClient } from "@/lib/supabase/admin";
import { getWalletBalance, IStarError } from "@/lib/istar";
import TelegramPremiumConfigForm from "@/components/TelegramPremiumConfigForm";

export default async function AdminTelegramPremiumPage() {
  const admin = createAdminClient();

  const { data: row } = await admin.from("istar_config").select("*").eq("id", true).maybeSingle();

  const config = {
    enabled: Boolean(row?.enabled),
    customerVisible: Boolean(row?.customer_visible),
    ngnPerStar: row?.ngn_per_star ?? 0,
    markupAmountNgn: row?.markup_amount_ngn ?? 0,
    updatedAt: row?.updated_at ?? null,
  };

  // Best-effort — a missing/invalid ISTAR_API_KEY shouldn't take down the
  // whole settings page, just the wallet balance display.
  let wallet = null;
  let walletError = "";
  try {
    wallet = await getWalletBalance("TON");
  } catch (err) {
    walletError = err instanceof IStarError ? err.message : "Could not load wallet balance.";
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">Telegram Premium &amp; Stars</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          Telegram Stars and Telegram Premium gifting, billed from the site's own iStar TON/USDT
          wallet — not a customer's NGN balance is what actually pays iStar, but customers still
          pay in NGN out of their wallet here, same as every other product. Two separate switches
          below: "Enabled" is your own test-ordering access (always available to you as admin, with
          the TON/USDT wallet picker visible); "Let customers see it" is a second, off-by-default
          switch that opens the real buy flow to everyone else — with the wallet picker hidden, since
          that's an internal detail, not a customer choice.
        </p>
      </div>

      <div className="card card-pad">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[15px]">iStar wallet balance</h3>
        </div>
        {walletError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{walletError}</p>
        ) : (
          <p className="text-sm text-gray-500 dark:text-night-300">
            {wallet ? (
              <>
                <span className="font-bold text-gray-900 dark:text-night-50">
                  {wallet.balance} {wallet.currency || "TON"}
                </span>{" "}
                — this is what funds every star/premium order placed below. Top it up directly in
                the iStar dashboard; NexaVerify has no way to fund it from here.
              </>
            ) : (
              "No balance data returned."
            )}
          </p>
        )}
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-4">Settings</h3>
        <TelegramPremiumConfigForm config={config} />
      </div>
    </div>
  );
}
