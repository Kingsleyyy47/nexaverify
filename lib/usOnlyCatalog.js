import "server-only";
import { getApps, computeNgnPrice, GetatextError } from "@/lib/getatext";

// Shared server-side helper for the "US Only" provider's priced, filtered
// catalog — used by both app/(customer)/products/us-only/page.js and the
// dashboard's quick-buy section, so the two can never drift apart on
// pricing/sorting logic. Backed by Getatext (lib/getatext.js) — unlike "All
// countries" (DaisySim), there's no country picker here, since Getatext only
// ever sells US numbers; the whole catalog is small enough to fetch and
// price up front in one server-side call, same spirit as how the dashboard
// already pre-fetches DaisySMS's public.services list.
//
// `supabase` can be either the RLS-scoped client from getSessionProfile() or
// an admin client — daisysim_usa_config/overrides are both public-select
// tables, so either works for reads. Table/column names still say
// "daisysim_usa" for historical reasons (this product used to be backed by
// DaisySim's server7 API) — renaming them isn't worth the migration risk
// since they're purely internal, never shown to customers (who only ever
// see "US Only").
export async function getUsOnlyCatalog(supabase) {
  const { data: config } = await supabase
    .from("daisysim_usa_config")
    .select("enabled, markup_amount_ngn")
    .eq("id", true)
    .maybeSingle();

  const enabled = config?.enabled ?? false; // fails closed — new, opt-in provider
  if (!enabled) {
    return { enabled: false, services: [], error: null };
  }

  const { data: usdRateRow } = await supabase
    .from("currency_rates")
    .select("ngn_per_unit")
    .eq("currency", "USD")
    .maybeSingle();
  const usdRate = usdRateRow ? Number(usdRateRow.ngn_per_unit) : null;
  if (!usdRate) {
    return { enabled: true, services: [], error: "Pricing isn't set up yet — an admin needs to set a USD rate first." };
  }

  try {
    const apps = await getApps();

    const { data: overrides } = await supabase
      .from("daisysim_usa_overrides")
      .select("service_code, favorite, disabled");
    const overrideMap = new Map((overrides || []).map((o) => [o.service_code, o]));

    const visible = apps.filter((a) => !overrideMap.get(a.code)?.disabled);
    visible.sort((a, b) => {
      const aFav = overrideMap.get(a.code)?.favorite ? 1 : 0;
      const bFav = overrideMap.get(b.code)?.favorite ? 1 : 0;
      return bFav - aFav;
    });

    const services = visible.map((a) => ({
      code: a.code,
      name: a.name,
      priceUsd: a.price, // raw USD — pass through unmodified to /api/us-only/buy as an estimate
      priceNgn: computeNgnPrice(a.price, usdRate, config.markup_amount_ngn),
    }));

    return { enabled: true, services, error: null };
  } catch (err) {
    const message = err instanceof GetatextError ? err.message : "Could not load services right now.";
    return { enabled: true, services: [], error: message };
  }
}
