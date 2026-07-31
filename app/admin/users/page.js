import { createAdminClient } from "@/lib/supabase/admin";
import UsersList from "@/components/UsersList";

export default async function AdminUsersPage() {
  const admin = createAdminClient();
  const { data: users } = await admin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          Find a user, view their balance and transaction history, or adjust their balance.
        </p>
      </div>

      <div className="card card-pad">
        <UsersList users={users || []} />
      </div>
    </div>
  );
}
