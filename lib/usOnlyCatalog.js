import "server-only";
import { getApps, computeNgnPrice } from "@/lib/getatext";
import { getApps as getAppsUsa } from "@/lib/daisysimUsa";
import { logError, customerErrorMessage } from "@/lib/errorLog";

// Shared server-side helper for the "US Only" provider's priced, filtered
// catalog — used by both app/(customer)/products/us-only/page.js and the
// dashboard's quick-buy section, so the two can never drift apart on
// pricing/sorting logic. Backed by ONE of two interchangeable providers —
// Getatext (lib/getatext.js) or DaisySim's dedicated USA "server7" API
// (lib/daisysimUsa.js) — chosen by daisysim_usa_config.backend, never both at
// once. Unlike "All countries" (DaisySim's general product), neither backend
// has a country picker here — both only ever sell US numbers — so the whole
// catalog is small enough to fetch and price up front in one server-side
// call, same spirit as how the dashboard already pre-fetches DaisySMS's
// public.services list.
//
// `supabase` can be either the RLS-scoped client from getSessionProfile() or
// an admin client — daisysim_usa_config/overrides are both public-select
// tables, so either works for reads. Table/column names still say
// "daisysim_usa" for historical reasons (this product used to be backed
// exclusively by DaisySim's server7 API before Getatext, and now can be
// backed by either) — renaming them isn't worth the migration risk since
// they're purely internal, never shown to customers (who only ever see "US
// Only").
export async function getUsOnlyCatalog(supabase, userId = null) {
  const { data: config } = await supabase
    .from("daisysim_usa_config")
    .select("enabled, markup_amount_ngn, backend")
    .eq("id", true)
    .maybeSingle();

  const enabled = config?.enabled ?? false; // fails closed — new, opt-in provider
  if (!enabled) {
    return { enabled: false, services: [], error: null };
  }

  const backend = config?.backend === "daisysim" ? "daisysim" : "getatext";

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
    const apps = backend === "daisysim" ? await getAppsUsa() : await getApps();

    // Scoped to the CURRENT backend — Getatext and DaisySim's server7 API
    // have separate code namespaces, so an override saved while on one
    // backend must never apply to the other's services (see schema.sql's
    // comment on daisysim_usa_overrides.backend).
    const { data: overrides } = await supabase
      .from("daisysim_usa_overrides")
      .select("service_code, favorite, disabled, markup_ngn")
      .eq("backend", backend);
    const overrideMap = new Map((overrides || []).map((o) => [o.service_code, o]));

    const visible = apps.filter((a) => !overrideMap.get(a.code)?.disabled);
    visible.sort((a, b) => {
      const aFav = overrideMap.get(a.code)?.favorite ? 1 : 0;
      const bFav = overrideMap.get(b.code)?.favorite ? 1 : 0;
      return bFav - aFav;
    });

    const services = visible.map((a) => {
      // A service with its own saved markup uses that; everything else keeps
      // inheriting the single global default — see the schema.sql comment on
      // daisysim_usa_overrides.markup_ngn.
      const override = overrideMap.get(a.code);
      const markupNgn = override?.markup_ngn != null ? Number(override.markup_ngn) : Number(config.markup_amount_ngn || 0);
      return {
        code: a.code,
        name: a.name,
        priceUsd: a.price, // raw USD — pass through unmodified to /api/us-only/buy as an estimate
        priceNgn: computeNgnPrice(a.price, usdRate, markupNgn),
        stock: a.stock ?? null, // Getatext's live "pcs left" count — shown to customers as-is
      };
    });

    return { enabled: true, services, error: null };
  } catch (err) {
    // Never hand a caught provider error's raw .message to a customer —
    // it's whatever the provider's own API happened to return (including,
    // in a real Sept 2026 incident, a raw HTTP-status fallback string, and
    // in the original Sept 2026 incident before that, an actual Cloudflare
    // HTML/CSP fragment). Log it and show only a generic message + a
    // reference ID the customer can quote to support — same convention as
    // every other customer-facing failure in this app (see lib/apiError.js).
    const referenceId = await logError({
      error: err,
      route: "us-only-catalog",
      userId,
      context: { backend },
    });
    return { enabled: true, services: [], error: customerErrorMessage(referenceId) };
  }
}
