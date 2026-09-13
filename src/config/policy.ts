/**
 * UZA policy constants — THE single source of truth for every business number.
 *
 * Rules:
 *  - No business/money literal may appear anywhere else in the codebase.
 *  - Every constant is tagged CONFIRMED (signed off by the business) or
 *    ASSUMED (working default, must be confirmed before it is quoted to a client).
 *  - Changing a value here is a code change; end users never edit these from the UI.
 *  - All money is handled as INTEGER MINOR UNITS (see src/lib/pricing.ts).
 */

export type ConfidenceTag = "CONFIRMED" | "ASSUMED";

/* ------------------------------------------------------------------ */
/* Currency & formatting                                               */
/* ------------------------------------------------------------------ */

export const CURRENCY_CODES = ["RWF", "USD", "CNY"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/** CONFIRMED — RWF is the reporting currency for every UZA project. */
export const BASE_CURRENCY: CurrencyCode = "RWF";

/**
 * CONFIRMED — minor-unit exponent per currency.
 * RWF is not subdivided in practice, so its minor unit is the franc itself.
 */
export const CURRENCY_MINOR_EXPONENT: Record<CurrencyCode, number> = {
  RWF: 0,
  USD: 2,
  CNY: 2,
};

/** CONFIRMED — money is displayed as `RWF 1,234,567` (no decimals for RWF). */
export const CURRENCY_DISPLAY_DECIMALS: Record<CurrencyCode, number> = {
  RWF: 0,
  USD: 2,
  CNY: 2,
};

/* ------------------------------------------------------------------ */
/* Tax                                                                 */
/* ------------------------------------------------------------------ */

/** CONFIRMED — Rwanda standard VAT rate (Rwanda Revenue Authority). */
export const VAT_RATE_PCT = 18;

/** ASSUMED — quoted BOQ prices are VAT-exclusive until finance confirms otherwise. */
export const PRICES_ARE_VAT_INCLUSIVE = false;

/* ------------------------------------------------------------------ */
/* Rounding                                                            */
/* ------------------------------------------------------------------ */

/** ASSUMED — client-facing RWF totals round up to the nearest 1,000 RWF. */
export const CLIENT_TOTAL_ROUNDING_MINOR: Record<CurrencyCode, number> = {
  RWF: 1_000,
  USD: 1,
  CNY: 1,
};

/* ------------------------------------------------------------------ */
/* Finishing Solutions margin & markup                                 */
/* ------------------------------------------------------------------ */

/** ASSUMED (decision pending, Sept 2026) — default margin applied on materials. */
export const DEFAULT_MATERIAL_MARGIN_PCT = 20;

/** ASSUMED — default margin applied on installation / labour lines. */
export const DEFAULT_LABOUR_MARGIN_PCT = 25;

/** ASSUMED — preliminaries & site establishment, as % of net works cost. */
export const DEFAULT_PRELIMINARIES_PCT = 5;

/** ASSUMED — design contingency carried on every draft BOQ. */
export const DEFAULT_CONTINGENCY_PCT = 5;

/** ASSUMED — default wastage allowance by material family (%). */
export const DEFAULT_WASTAGE_PCT: Record<string, number> = {
  tiles: 10,
  paint: 5,
  masonry: 8,
  timber: 8,
  gypsum: 7,
  other: 5,
};

/* ------------------------------------------------------------------ */
/* Solar options                                                       */
/* ------------------------------------------------------------------ */

/** CONFIRMED — solar/grid mixes offered to clients, as solar share (%). */
export const SOLAR_SHARE_OPTIONS_PCT = [20, 30, 40, 50, 60, 70, 80] as const;

/** ASSUMED — Kigali average peak sun hours per day. */
export const SOLAR_PEAK_SUN_HOURS = 5;

/** ASSUMED — end-to-end system losses (%). */
export const SOLAR_SYSTEM_LOSSES_PCT = 20;

/** ASSUMED — battery autonomy carried in a standard proposal (days). */
export const SOLAR_BATTERY_AUTONOMY_DAYS = 1;

/** ASSUMED — usable depth of discharge for lithium storage (%). */
export const SOLAR_DEPTH_OF_DISCHARGE_PCT = 80;

/* ------------------------------------------------------------------ */
/* Group commercial formula (CONFIRMED, Sept 2026)                     */
/* Shared across UZA ventures; referenced here so no venture re-invents */
/* the numbers. Not all are used by UZA Build today.                   */
/* ------------------------------------------------------------------ */

/** CONFIRMED — investor takes 65% of container margin, UZA keeps 35%. */
export const INVESTOR_MARGIN_SHARE_PCT = 65;
export const UZA_MARGIN_SHARE_PCT = 35;

/** CONFIRMED — landing cost = selling price x (1 - 13.33%). */
export const INVESTOR_LANDING_DISCOUNT_PCT = 13.33;

/** CONFIRMED — acceptance band on the investor return; >= 10.5% must be rejected. */
export const INVESTOR_RETURN_MIN_PCT = 10.0;
export const INVESTOR_RETURN_MAX_PCT = 10.4;

/* ------------------------------------------------------------------ */
/* Stage machine — the 11-stage UZA client journey (CONFIRMED)         */
/* ------------------------------------------------------------------ */

export const PROJECT_STAGES = [
  { key: "intake", label: "Client intake & brief" },
  { key: "drawings", label: "Drawings & documents received" },
  { key: "site_survey", label: "Site survey & verification" },
  { key: "concept", label: "Concept & theme direction" },
  { key: "takeoff", label: "AI-assisted takeoff" },
  { key: "boq", label: "BOQ generation & pricing" },
  { key: "review", label: "Specialist review & sign-off" },
  { key: "proposal", label: "Client proposal & agreement" },
  { key: "procurement", label: "Procurement & supplier orders" },
  { key: "delivery", label: "Delivery & installation" },
  { key: "handover", label: "Handover & closeout" },
] as const;

export type ProjectStageKey = (typeof PROJECT_STAGES)[number]["key"];

/* ------------------------------------------------------------------ */
/* Approval sequence (CONFIRMED)                                       */
/* ------------------------------------------------------------------ */

/** Order in which specialist sign-off must happen on a BOQ version. */
export const APPROVAL_SEQUENCE = [
  "architect",
  "interior_designer",
  "mep_engineer",
  "qs",
  "project_manager",
] as const;

/** CONFIRMED — roles that may never see cost build-up, margin or the catalog cost base. */
export const COST_BLIND_ROLES = ["client"] as const;

/* ------------------------------------------------------------------ */
/* Exchange rates (factory quotations)                                 */
/* ------------------------------------------------------------------ */

/** CONFIRMED — published rate feed used to convert factory RMB into client USD. */
export const FX_SOURCE_URL = "https://open.er-api.com/v6/latest/USD";
export const FX_SOURCE_LABEL = "open.er-api.com (published USD reference rates)";

/** ASSUMED — how long a fetched rate stays usable before we refresh it (hours). */
export const FX_MAX_AGE_HOURS = 12;

/**
 * CONFIRMED (founder, Sept 2026) — the default RMB/USD basis a new proforma
 * starts from, and the last-resort fallback when no published rate can be
 * reached at all.
 *
 * This is NOT a market-rate approximation. The real published market rate is
 * roughly 7.1 RMB/USD (see `getUsdRmbRate` in src/lib/fx.functions.ts, which
 * still fetches it live, for reference). 6 is deliberately lower than the
 * real rate: rmbToUsdMinor divides RMB by this rate, so a LOWER divisor
 * produces a HIGHER USD figure for the same RMB factory cost — quoting off 6
 * instead of 7.1 bakes in UZA's margin on every factory quotation converted
 * to a client price. It is a standing commercial decision, not a figure to
 * keep in sync with the market.
 *
 * A preparer still sees the real published rate for reference and can type a
 * different rate for a specific deal (the "RMB per USD" field on
 * ProformaPanel.tsx, pinned per document) — this constant only sets what a
 * NEW proforma starts from before that override.
 */
export const FX_FALLBACK_RMB_PER_USD = 6;

/* ------------------------------------------------------------------ */
/* Stage gate — who must sign a stage off before the next one starts   */
/* (CONFIRMED; mirrored exactly by the database trigger)               */
/* ------------------------------------------------------------------ */

export const STAGE_REQUIRED_ROLES: Record<ProjectStageKey, readonly string[]> = {
  intake: ["project_manager"],
  drawings: ["architect"],
  site_survey: ["project_manager"],
  concept: ["interior_designer"],
  takeoff: ["qs"],
  boq: ["qs"],
  review: ["architect", "mep_engineer", "project_manager"],
  proposal: ["project_manager"],
  procurement: ["procurement"],
  delivery: ["project_manager"],
  handover: ["project_manager"],
};

/* ------------------------------------------------------------------ */
/* Package sourcing & BOQ preparation                                  */
/* ------------------------------------------------------------------ */

/**
 * ASSUMED (proposed Sept 2026, not yet published to clients) —
 * minimum fee charged for preparing a BOQ and engaging factories.
 * It is credited in full against the order when the client places it; its
 * purpose is to filter out clients who are not serious, and to fund the
 * activation payment a manufacturer needs before it starts processing.
 */
export const BOQ_PREPARATION_FEE_USD = 500;

/** ASSUMED — activation amount released to a manufacturer to start processing an order. */
export const MANUFACTURER_ACTIVATION_FEE_USD = 500;

/** CONFIRMED — the fee is credited against the order value once the client orders. */
export const BOQ_FEE_CREDITED_ON_ORDER = true;

/** CONFIRMED — every product family is sourced from a shortlist, never a single factory. */
export const MANUFACTURERS_PER_PACKAGE_MIN = 2;
export const MANUFACTURERS_PER_PACKAGE_MAX = 3;
