import { redirect } from "next/navigation";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import AdminSidebar from "@/components/AdminSidebar";
import AdminTopBar from "@/components/AdminTopBar";

export default async function AdminLayout({ children }) {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login");
  if (!isAdmin(profile)) redirect("/dashboard");

  return (
    <div className="min-h-screen flex">
      <AdminSidebar profile={profile} />
      <main className="flex-1 p-6 md:p-9 max-w-6xl w-full">
        <AdminTopBar />
        {children}
      </main>
    </div>
  );
}
