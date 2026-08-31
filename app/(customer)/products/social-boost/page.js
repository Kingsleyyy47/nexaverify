import { getSessionProfile, isAdmin } from "@/lib/auth";
import SocialBoostBuyForm from "@/components/SocialBoostBuyForm";

// Admins always see the real buy flow here (to test it end-to-end with their
// own wallet), gated only by social_boost_config.enabled in the API routes.
// Everyone else additionally needs social_boost_config.customer_visible — a
// SEPARATE, off-by-default switch from `enabled`, flipped on at
// /admin/social-boost only once you're happy with testing. Same two-switch
// shape as Telegram Premium — see istar_config's comment in schema.sql for
// the original reasoning.
export default async function SocialBoostPage() {
  const { user, profile, supabase } = await getSessionProfile();
  const admin = isAdmin(profile);

  const { data: config } = await supabase.from("social_boost_config").select("*").eq("id", true).maybeSingle();
  const customerVisible = Boolean(config?.customer_visible);

  if (!admin && !customerVisible) {
    return (
      <div>
        <div className="mb-7">
          <h1 className="text-2xl font-bold">Social Boost</h1>
          <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
            Followers, likes, views, and comments — delivered straight to your links.
          </p>
        </div>
        <div className="card card-pad text-sm text-gray-500 dark:text-night-400">
          Coming soon — check back later.
        </div>
      </div>
    );
  }

  // Each customer only ever sees their own orders (RLS-scoped client, same
  // as every other "my history" query in this app) — admins see the same,
  // just from their own admin account, not a cross-customer view (that's
  // what /admin/social-boost's own order log is for, if ever added).
  const { data: orders } = await supabase
    .from("social_boost_orders")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Social Boost</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          {admin && !customerVisible
            ? 'Admin test view — customers currently see this as "Coming soon" until you flip on customer visibility in admin settings. Purchases here debit your own wallet balance, exactly like a real customer purchase would.'
            : "Followers, likes, views, and comments — delivered straight to your links, paid from your wallet balance."}
        </p>
      </div>
      <SocialBoostBuyForm isAdminView={admin} initialOrders={orders || []} />
    </div>
  );
}
