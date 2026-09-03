import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrderTopActions, CredentialsList } from "@/components/OrderCredentialsActions";

// Server Component so ownership can be checked against the service role
// key BEFORE any credential ever leaves the server — digital_stock_items has
// no RLS select policy at all (see schema.sql), by design, precisely so this
// page has to do that check explicitly rather than leaning on RLS for
// something this sensitive.
export default async function DigitalOrderDetailsPage({ params }) {
  const { user, profile } = await getSessionProfile();
  if (!user) notFound();

  const admin = createAdminClient();
  const { data: order } = await admin.from("digital_orders").select("*").eq("id", params.id).maybeSingle();

  if (!order || (order.user_id !== user.id && !isAdmin(profile))) {
    notFound();
  }

  const { data: stockItems } = await admin
    .from("digital_stock_items")
    .select("*")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  const liveItems = stockItems || [];
  const snapshotItems = Array.isArray(order.credentials_snapshot)
    ? order.credentials_snapshot.map((item, idx) => ({
        id: item.id || `${order.id}-snapshot-${idx}`,
        username: item.username || null,
        email: item.email || null,
        password: item.password || "",
        email_password: item.email_password || null,
        two_fa: item.two_fa || null,
        recovery_email: item.recovery_email || null,
        recovery_email_password: item.recovery_email_password || null,
        year: item.year || null,
        friends_count: item.friends_count || null,
        created_at: item.created_at || order.created_at,
      }))
    : [];
  const expectedQuantity = Number(order.quantity || 0);
  const items =
    liveItems.length >= expectedQuantity || snapshotItems.length <= liveItems.length
      ? liveItems
      : snapshotItems;

  return (
    <div>
      <Link
        href="/history"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-night-400 hover:text-gray-800 dark:hover:text-night-100 mb-4"
      >
        <ArrowLeft size={16} /> Back to history
      </Link>

      <div className="mb-1">
        <h1 className="text-xl font-bold">Order Details</h1>
        <p className="text-xs text-gray-400 dark:text-night-500 font-mono">{order.id}</p>
      </div>

      <OrderTopActions order={order} items={items} />

      <div className="grid grid-cols-2 gap-3 mt-5">
        <div className="rounded-xl bg-gray-50 dark:bg-night-800 px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold">
            Platform
          </div>
          <div className="font-bold">{order.category_name || "—"}</div>
        </div>
        <div className="rounded-xl bg-gray-50 dark:bg-night-800 px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold">Items</div>
          <div className="font-bold">{order.quantity}</div>
        </div>
        <div className="rounded-xl bg-gray-50 dark:bg-night-800 px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold">Total</div>
          <div className="font-bold">₦{Number(order.total_ngn).toLocaleString("en-US")}</div>
        </div>
        <div className="rounded-xl bg-gray-50 dark:bg-night-800 px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold">Date</div>
          <div className="font-bold">{new Date(order.created_at).toLocaleDateString("en-US")}</div>
        </div>
      </div>

      <div className="rounded-xl bg-gray-50 dark:bg-night-800 px-4 py-3 mt-3">
        <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold">Product</div>
        <div className="font-bold break-all">{order.template_name}</div>
        {order.template_description && (
          <p className="text-sm text-gray-500 dark:text-night-300 mt-1 break-all">{order.template_description}</p>
        )}
      </div>

      <div className="flex items-center justify-between mt-6 mb-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-night-300">
          Credentials ({items.length})
        </h2>
        <span className="badge badge-success">completed</span>
      </div>

      <CredentialsList items={items} />

      <p className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-night-500 mt-5">
        Purchased on {new Date(order.created_at).toLocaleDateString("en-US")}. Keep these credentials private
        and update security details after login.
      </p>
    </div>
  );
}
