import { createClient } from "@/lib/supabase/server";
import MarketingHeader from "@/components/MarketingHeader";
import MarketingFooter from "@/components/MarketingFooter";
import WebsiteServicesSection from "@/components/WebsiteServicesSection";

export const metadata = {
  title: "Website services — NexaVerify",
};

export default async function WebsitePage() {
  // Public page — no login required. onboarding_config has a select-all RLS
  // policy, so the plain anon-key client can read the same support link the
  // welcome popup uses, no service role needed here.
  const supabase = createClient();
  const { data: config } = await supabase
    .from("onboarding_config")
    .select("support_url")
    .eq("id", true)
    .maybeSingle();

  return (
    <div className="min-h-screen flex flex-col">
      <MarketingHeader />
      <main className="flex-1">
        <WebsiteServicesSection supportUrl={config?.support_url || ""} />
      </main>
      <MarketingFooter />
    </div>
  );
}
