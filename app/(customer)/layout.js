import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import CustomerSidebar from "@/components/CustomerSidebar";
import CustomerTopBar from "@/components/CustomerTopBar";
import { CurrencyProvider } from "@/components/CurrencyProvider";

export default async function CustomerLayout({ children }) {
  const { user, profile, supabase } = await getSessionProfile();
  if (!user) redirect("/login");

  const { data: rates } = await supabase.from("currency_rates").select("*");

  return (
    <CurrencyProvider rates={rates}>
      <div className="min-h-screen flex">
        <CustomerSidebar profile={profile} />
        <main className="flex-1 p-6 md:p-9 max-w-6xl w-full">
          <CustomerTopBar balance={profile?.balance || 0} />
          {children}
        </main>
      </div>
    </CurrencyProvider>
  );
}
