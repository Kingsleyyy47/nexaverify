import { NextResponse } from "next/server";
import { getSessionProfile, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";

const BUCKET = "backups";
const RETENTION_COUNT = 30; // keep the most recent 30 backups, prune anything older

// Snapshots profiles/transactions/rentals to a timestamped JSON file in the
// private "backups" Storage bucket (created by supabase/schema.sql). This is
// what replaces manually exporting CSVs from the Table Editor — run it on a
// schedule (see supabase/cron.sql) and it just happens on its own.
//
// Callable by a logged-in admin, or by a scheduled job carrying CRON_SECRET.
export async function POST(request) {
  if (!isAuthorizedCron(request)) {
    const { user, profile } = await getSessionProfile();
    if (!user || !isAdmin(profile)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const admin = createAdminClient();

  const [{ data: profiles }, { data: transactions }, { data: rentals }] = await Promise.all([
    admin.from("profiles").select("*"),
    admin.from("transactions").select("*"),
    admin.from("rentals").select("*"),
  ]);

  const snapshot = {
    generated_at: new Date().toISOString(),
    profiles: profiles || [],
    transactions: transactions || [],
    rentals: rentals || [],
  };

  const filename = `backup-${snapshot.generated_at.replace(/[:.]/g, "-")}.json`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(filename, JSON.stringify(snapshot, null, 2), {
      contentType: "application/json",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Backup upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // Prune anything beyond the retention count so storage doesn't grow forever.
  // Filenames are ISO timestamps, so alphabetical order is chronological order.
  const { data: files } = await admin.storage.from(BUCKET).list("", {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  let pruned = 0;
  if (files && files.length > RETENTION_COUNT) {
    const toDelete = files.slice(0, files.length - RETENTION_COUNT).map((f) => f.name);
    if (toDelete.length > 0) {
      await admin.storage.from(BUCKET).remove(toDelete);
      pruned = toDelete.length;
    }
  }

  return NextResponse.json({
    ok: true,
    file: filename,
    counts: {
      profiles: profiles?.length || 0,
      transactions: transactions?.length || 0,
      rentals: rentals?.length || 0,
    },
    pruned,
  });
}
