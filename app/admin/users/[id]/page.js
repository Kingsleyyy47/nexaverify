import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import AdjustBalanceForm from "@/components/AdjustBalanceForm";
import SetUsernameForm from "@/components/SetUsernameForm";
import ResetPasswordForm from "@/components/ResetPasswordForm";

export default async function AdminUserDetailPage({ params }) {
  const admin = createAdminClient();

  const [{ data: user }, { data: transactions }, { data: rentals }] = await Promise.all([
    admin.from("profiles").select("*").eq("id", params.id).single(),
    admin
      .from("transactions")
      .select("*")
      .eq("user_id", params.id)
      .order("created_at", { ascending: false }),
    admin
      .from("rentals")
      .select("*")
      .eq("user_id", params.id)
      .order("created_at", { ascending: false }),
  ]);

  if (!user) notFound();

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">{user.username || user.email}</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          {user.username ? `${user.email} · ` : ""}Role: {user.role} · Joined{" "}
          {new Date(user.created_at).toLocaleDateString("en-US")}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <div className="card card-pad">
          <div className="text-sm text-gray-500 dark:text-night-400 font-semibold mb-2">
            Current balance
          </div>
          <div className="text-3xl font-bold mb-5">₦{Number(user.balance).toLocaleString("en-US")}</div>
          <AdjustBalanceForm userId={user.id} />
        </div>

        <div className="card card-pad">
          <div className="text-sm text-gray-500 dark:text-night-400 font-semibold mb-3">
            Numbers purchased
          </div>
          <div className="text-3xl font-bold mb-1">{rentals?.length || 0}</div>
          <div className="text-xs text-gray-400 dark:text-night-400">
            {(rentals || []).filter((r) => r.is_long_term).length} long-term ·{" "}
            {(rentals || []).filter((r) => r.status === "waiting").length} awaiting SMS
          </div>
        </div>

        <div className="card card-pad">
          <div className="text-sm text-gray-500 dark:text-night-400 font-semibold mb-3">
            {user.username ? "Username" : "No username set"}
          </div>
          <SetUsernameForm userId={user.id} currentUsername={user.username} />
        </div>
      </div>

      <div className="card card-pad max-w-sm">
        <h3 className="font-bold text-[15px] mb-1">Reset password</h3>
        <p className="text-xs text-gray-400 dark:text-night-400 mb-4">
          Sets a new password immediately, no email link — for when a customer can't get to their
          inbox. Share the new password with them directly afterward.
        </p>
        <ResetPasswordForm userId={user.id} />
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-4">Transaction history</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 border-b border-gray-100 dark:border-night-700">
                <th className="pb-2.5 font-bold">Type</th>
                <th className="pb-2.5 font-bold">Note</th>
                <th className="pb-2.5 font-bold">Date</th>
                <th className="pb-2.5 font-bold text-right">Amount</th>
                <th className="pb-2.5 font-bold text-right">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {(transactions || []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-400 dark:text-night-400">
                    No transactions yet.
                  </td>
                </tr>
              )}
              {(transactions || []).map((t) => (
                <tr key={t.id} className="border-b border-gray-50 dark:border-night-700 last:border-0">
                  <td className="py-3.5 capitalize">{t.type.replace("_", " ")}</td>
                  <td className="py-3.5 text-gray-400 dark:text-night-400">{t.note || "—"}</td>
                  <td className="py-3.5 text-gray-400 dark:text-night-400">
                    {new Date(t.created_at).toLocaleString("en-US")}
                  </td>
                  <td
                    className={`py-3.5 text-right font-semibold ${
                      t.amount >= 0 ? "text-brand-600 dark:text-brand-400" : "text-red-500 dark:text-red-400"
                    }`}
                  >
                    {t.amount >= 0 ? "+" : ""}₦{Number(t.amount).toLocaleString("en-US")}
                  </td>
                  <td className="py-3.5 text-right text-gray-500 dark:text-night-400">
                    ₦{Number(t.balance_after).toLocaleString("en-US")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="font-bold text-[15px] mb-4">Rental history</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 border-b border-gray-100 dark:border-night-700">
                <th className="pb-2.5 font-bold">Number</th>
                <th className="pb-2.5 font-bold">Service</th>
                <th className="pb-2.5 font-bold">Status</th>
                <th className="pb-2.5 font-bold">Long-term</th>
                <th className="pb-2.5 font-bold text-right">Charged</th>
                <th className="pb-2.5 font-bold text-right">DaisySMS cost</th>
              </tr>
            </thead>
            <tbody>
              {(rentals || []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-400 dark:text-night-400">
                    No rentals yet.
                  </td>
                </tr>
              )}
              {(rentals || []).map((r) => (
                <tr key={r.id} className="border-b border-gray-50 dark:border-night-700 last:border-0">
                  <td className="py-3.5 font-mono">{r.phone_number}</td>
                  <td className="py-3.5">{r.service_id}</td>
                  <td className="py-3.5 capitalize">{r.status}</td>
                  <td className="py-3.5">{r.is_long_term ? "Yes" : "No"}</td>
                  <td className="py-3.5 text-right">₦{Number(r.price).toLocaleString("en-US")}</td>
                  <td className="py-3.5 text-right text-gray-400 dark:text-night-400">
                    {r.cost_usd != null ? `$${Number(r.cost_usd).toFixed(2)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
