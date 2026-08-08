import { createAdminClient } from "@/lib/supabase/admin";
import OnboardingConfigForm from "@/components/OnboardingConfigForm";

export default async function AdminOnboardingPage() {
  const admin = createAdminClient();
  const { data: row } = await admin.from("onboarding_config").select("*").eq("id", true).maybeSingle();

  const config = {
    enabled: row?.enabled ?? true,
    telegramUrl: row?.telegram_url ?? "",
    supportUrl: row?.support_url ?? "",
    welcomeTitle: row?.welcome_title ?? "Welcome to NexaVerify!",
    welcomeIntro: row?.welcome_intro ?? "",
    buyInstructions: row?.buy_instructions ?? "",
    smsCostsText: row?.sms_costs_text ?? "",
  };

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Welcome popup</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          Shown to every customer on every dashboard visit, unless they've tapped "Don't show for
          24 hours" recently. Edit the links and copy here any time — changes apply immediately, no
          redeploy needed. Turning this off hides it for everyone, regardless of anyone's 24-hour
          mute.
        </p>
      </div>

      <div className="card card-pad">
        <OnboardingConfigForm config={config} />
      </div>
    </div>
  );
}
