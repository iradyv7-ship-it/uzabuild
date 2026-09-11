/**
 * Pure money maths for UZA Build.
 *
 * Invariants:
 *  - Money is always an INTEGER number of minor units (RWF francs, USD cents).
 *  - No float ever holds a money value; percentages and quantities may be floats.
 *  - Every function here is pure and unit-tested (src/lib/pricing.test.ts).
 *  - Every business number comes from src/config/policy.ts — no literals here.
 */

import {
  BASE_CURRENCY,
  CLIENT_TOTAL_ROUNDING_MINOR,
  CURRENCY_DISPLAY_DECIMALS,
  CURRENCY_MINOR_EXPONENT,
  DEFAULT_CONTINGENCY_PCT,
  DEFAULT_PRELIMINARIES_PCT,
  INVESTOR_LANDING_DISCOUNT_PCT,
  INVESTOR_MARGIN_SHARE_PCT,
  INVESTOR_RETURN_MAX_PCT,
  INVESTOR_RETURN_MIN_PCT,
  VAT_RATE_PCT,
  type CurrencyCode,
} from "@/config/policy";

/** Branded integer minor-unit amount. */
export type Minor = number;

export class MoneyError extends Error {}

function assertInteger(value: number, what: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new MoneyError(`${what} must be an integer number of minor units, got ${value}`);
  }
}

/** Half-up rounding that is symmetric around zero. */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Convert a major-unit figure (e.g. 22500000 RWF, 19.99 USD) to minor units. */
export function toMinor(major: number, currency: CurrencyCode = BASE_CURRENCY): Minor {
  if (!Number.isFinite(major)) throw new MoneyError(`Not a number: ${major}`);
  const factor = 10 ** CURRENCY_MINOR_EXPONENT[currency];
  return roundHalfUp(major * factor);
}

/** Convert minor units back to a major-unit number (display/export only). */
export function toMajor(minor: Minor, currency: CurrencyCode = BASE_CURRENCY): number {
  assertInteger(minor, "amount");
  return minor / 10 ** CURRENCY_MINOR_EXPONENT[currency];
}

/** Format money as `RWF 1,234,567`. */
export function formatMoney(minor: Minor, currency: CurrencyCode = BASE_CURRENCY): string {
  const decimals = CURRENCY_DISPLAY_DECIMALS[currency];
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toMajor(minor, currency));
  return `${currency} ${formatted}`;
}

/** Format a quantity with up to 3 decimals. */
export function formatQuantity(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(n);
}

/** Add up minor amounts safely. */
export function sumMinor(amounts: readonly Minor[]): Minor {
  return amounts.reduce<Minor>((total, a) => {
    assertInteger(a, "amount");
    return total + a;
  }, 0);
}

/** Apply a percentage to a minor amount, returning whole minor units. */
export function applyPct(minor: Minor, pct: number): Minor {
  assertInteger(minor, "amount");
  if (!Number.isFinite(pct)) throw new MoneyError(`Not a percentage: ${pct}`);
  return roundHalfUp((minor * pct) / 100);
}

/** Quantity x unit rate -> line amount in minor units. */
export function lineAmount(quantity: number, unitRateMinor: Minor): Minor {
  assertInteger(unitRateMinor, "unit rate");
  if (!Number.isFinite(quantity)) throw new MoneyError(`Not a quantity: ${quantity}`);
  return roundHalfUp(quantity * unitRateMinor);
}

/** Base quantity plus wastage allowance -> billable quantity. */
export function quantityWithWastage(baseQuantity: number, wastagePct: number): number {
  if (!Number.isFinite(baseQuantity) || !Number.isFinite(wastagePct)) return 0;
  return baseQuantity * (1 + wastagePct / 100);
}

/** Sell price derived from a cost and a margin percentage (margin on cost). */
export function withMargin(costMinor: Minor, marginPct: number): Minor {
  return costMinor + applyPct(costMinor, marginPct);
}

/** VAT amount on a VAT-exclusive net amount. */
export function vatOn(netMinor: Minor): Minor {
  return applyPct(netMinor, VAT_RATE_PCT);
}

export type BoqTotals = {
  netMinor: Minor;
  preliminariesMinor: Minor;
  contingencyMinor: Minor;
  subtotalMinor: Minor;
  vatMinor: Minor;
  grandTotalMinor: Minor;
};

/**
 * Roll a set of line amounts up into a BOQ total.
 * Preliminaries and contingency are computed on the net works cost.
 */
export function rollUpBoq(
  lineAmountsMinor: readonly Minor[],
  options?: { preliminariesPct?: number; contingencyPct?: number },
): BoqTotals {
  const netMinor = sumMinor(lineAmountsMinor);
  const preliminariesMinor = applyPct(netMinor, options?.preliminariesPct ?? DEFAULT_PRELIMINARIES_PCT);
  const contingencyMinor = applyPct(netMinor, options?.contingencyPct ?? DEFAULT_CONTINGENCY_PCT);
  const subtotalMinor = netMinor + preliminariesMinor + contingencyMinor;
  const vatMinor = vatOn(subtotalMinor);
  return {
    netMinor,
    preliminariesMinor,
    contingencyMinor,
    subtotalMinor,
    vatMinor,
    grandTotalMinor: subtotalMinor + vatMinor,
  };
}

/** Round a client-facing total up to the currency's presentation increment. */
export function roundClientTotal(minor: Minor, currency: CurrencyCode = BASE_CURRENCY): Minor {
  assertInteger(minor, "amount");
  const step = CLIENT_TOTAL_ROUNDING_MINOR[currency];
  if (step <= 1) return minor;
  return Math.ceil(minor / step) * step;
}

/** Signed delta between two priced BOQ versions, plus percentage change. */
export function priceDelta(previousMinor: Minor, nextMinor: Minor): { deltaMinor: Minor; deltaPct: number } {
  assertInteger(previousMinor, "previous total");
  assertInteger(nextMinor, "next total");
  const deltaMinor = nextMinor - previousMinor;
  const deltaPct = previousMinor === 0 ? 0 : (deltaMinor / previousMinor) * 100;
  return { deltaMinor, deltaPct };
}

/* ------------------------------------------------------------------ */
/* Group investor formula (shared UZA rule, single-sourced here)       */
/* ------------------------------------------------------------------ */

export type InvestorTerms = {
  sellingPriceMinor: Minor;
  landingCostMinor: Minor;
  marginMinor: Minor;
  investorShareMinor: Minor;
  uzaShareMinor: Minor;
  investorReturnPct: number;
};

/**
 * Selling price is fixed by UZA; landing cost is derived so the investor's
 * 65% share of margin equals ~10% of landing cost. Returns outside the
 * 10.0%-10.4% acceptance band are rejected, never silently rounded in.
 */
export function investorTerms(sellingPriceMinor: Minor): InvestorTerms {
  assertInteger(sellingPriceMinor, "selling price");
  const landingCostMinor = sellingPriceMinor - applyPct(sellingPriceMinor, INVESTOR_LANDING_DISCOUNT_PCT);
  const marginMinor = sellingPriceMinor - landingCostMinor;
  const investorShareMinor = applyPct(marginMinor, INVESTOR_MARGIN_SHARE_PCT);
  const uzaShareMinor = marginMinor - investorShareMinor;
  const investorReturnPct = landingCostMinor === 0 ? 0 : (investorShareMinor / landingCostMinor) * 100;
  // Band check is on the reported (2dp) return, the figure the business quotes.
  const reportedReturnPct = Number(investorReturnPct.toFixed(2));

  if (reportedReturnPct < INVESTOR_RETURN_MIN_PCT || reportedReturnPct > INVESTOR_RETURN_MAX_PCT) {
    throw new MoneyError(
      `Investor return ${reportedReturnPct.toFixed(2)}% is outside the accepted ${INVESTOR_RETURN_MIN_PCT}%-${INVESTOR_RETURN_MAX_PCT}% band`,
    );
  }

  return {
    sellingPriceMinor,
    landingCostMinor,
    marginMinor,
    investorShareMinor,
    uzaShareMinor,
    investorReturnPct: reportedReturnPct,
  };
}
