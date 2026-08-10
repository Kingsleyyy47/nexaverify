import { getSessionProfile } from "@/lib/auth";
import WebsiteServicesSection from "@/components/WebsiteServicesSection";

// Same content as app/website/page.js (the public version) — can't reuse
// that exact URL here since Next's route groups are transparent to the path
// and app/website/page.js already owns "/website", so this lives at
// "/get-a-website" instead. Rendered inside the logged-in dashboard shell
// instead of the marketing header/footer — see
// components/WebsiteServicesSection.js for the shared copy.
export default async function CustomerWebsitePage() {
  const { supabase } = await getSessionProfile();
  const { data: config } = await supabase
    .from("onboarding_config")
    .select("support_url")
    .eq("id", true)
    .maybeSingle();

  return (
    <div className="-m-4 md:-m-9">
      <WebsiteServicesSection supportUrl={config?.support_url || ""} />
    </div>
  );
}
