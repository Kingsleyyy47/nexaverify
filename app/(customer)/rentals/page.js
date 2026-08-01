import { getSessionProfile } from "@/lib/auth";
import NumberCard from "@/components/NumberCard";

export default async function RentalsPage() {
  const { supabase } = await getSessionProfile();

  const { data: rentals } = await supabase
    .from("rentals")
    .select("*")
    .order("created_at", { ascending: false });

  const all = rentals || [];
  const longTerm = all.filter((r) => r.is_long_term);
  const shortTerm = all.filter((r) => !r.is_long_term);

  return (
    <div className="space-y-9">
      <div>
        <h1 className="text-2xl font-bold">Rentals</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          Codes appear here automatically once they're delivered.
        </p>
      </div>

      <section>
        <h3 className="font-bold text-[15px] mb-3">Short-term rentals</h3>
        {shortTerm.length === 0 ? (
          <div className="card card-pad text-sm text-gray-400 dark:text-night-400">No short-term numbers yet.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {shortTerm.map((r) => (
              <NumberCard key={r.id} rental={r} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="font-bold text-[15px] mb-3">Long-term numbers</h3>
        {longTerm.length === 0 ? (
          <div className="card card-pad text-sm text-gray-400 dark:text-night-400">
            No long-term numbers yet. Check &quot;Long-term rental&quot; when buying a number to
            keep it in this space for repeated use.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {longTerm.map((r) => (
              <NumberCard key={r.id} rental={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
