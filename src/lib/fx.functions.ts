import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FX_FALLBACK_RMB_PER_USD, FX_MAX_AGE_HOURS, FX_SOURCE_LABEL, FX_SOURCE_URL } from "@/config/policy";

export type FxRate = {
  /** How many RMB one USD buys. */
  rate: number;
  source: string;
  /** Date the published rate refers to (ISO date). */
  asOf: string;
  fetchedAt: string;
  /** false = we could not reach the published source and fell back. */
  live: boolean;
  note: string | null;
};

type ErApiResponse = {
  result?: string;
  time_last_update_utc?: string;
  rates?: Record<string, number>;
};

/**
 * The working USD→RMB rate used on factory quotations and proformas.
 *
 * It comes from a published rate feed, is stored append-only in `fx_rates`
 * (so every proforma can be traced to the rate that priced it), and is only
 * re-fetched once the stored one is older than FX_MAX_AGE_HOURS.
 * If the feed cannot be reached we say so plainly and use the last stored
 * rate, or the tagged fallback constant if there is none.
 */
export const getUsdRmbRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FxRate> => {
    const { data: stored } = await context.supabase
      .from("fx_rates")
      .select("rate, source, as_of, fetched_at")
      .eq("base_currency", "USD")
      .eq("quote_currency", "CNY")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ageMs = stored ? Date.now() - new Date(stored.fetched_at).getTime() : Infinity;
    if (stored && ageMs < FX_MAX_AGE_HOURS * 60 * 60 * 1000) {
      return {
        rate: Number(stored.rate),
        source: stored.source,
        asOf: stored.as_of,
        fetchedAt: stored.fetched_at,
        live: true,
        note: null,
      };
    }

    try {
      const response = await fetch(FX_SOURCE_URL, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`rate feed responded ${response.status}`);
      const json = (await response.json()) as ErApiResponse;
      const rate = json.rates?.["CNY"];
      if (!Number.isFinite(rate) || !rate || rate <= 0) throw new Error("rate feed returned no CNY rate");

      const published = json.time_last_update_utc ? new Date(json.time_last_update_utc) : new Date();
      const asOf = published.toISOString().slice(0, 10);
      const fetchedAt = new Date().toISOString();

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("fx_rates").insert({
        base_currency: "USD",
        quote_currency: "CNY",
        rate,
        source: FX_SOURCE_LABEL,
        as_of: asOf,
        fetched_at: fetchedAt,
      });

      return { rate, source: FX_SOURCE_LABEL, asOf, fetchedAt, live: true, note: null };
    } catch {
      if (stored) {
        return {
          rate: Number(stored.rate),
          source: stored.source,
          asOf: stored.as_of,
          fetchedAt: stored.fetched_at,
          live: false,
          note: "The published rate feed could not be reached. Showing the last rate we recorded.",
        };
      }
      return {
        rate: FX_FALLBACK_RMB_PER_USD,
        source: "UZA working assumption",
        asOf: new Date().toISOString().slice(0, 10),
        fetchedAt: new Date().toISOString(),
        live: false,
        note: "No published rate has been recorded yet. This is an internal working rate, not a market rate.",
      };
    }
  });
