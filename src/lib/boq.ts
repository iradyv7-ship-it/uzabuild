/**
 * BOQ display helpers.
 *
 * All money maths lives in src/lib/pricing.ts and all business numbers in
 * src/config/policy.ts. This module only adapts DB values (major-unit numerics)
 * to those pure functions for display.
 */
import { CURRENCY_CODES, type CurrencyCode } from "@/config/policy";
import { formatMoney, formatQuantity, quantityWithWastage, toMinor } from "@/lib/pricing";

export type Currency = CurrencyCode;

export const CURRENCIES: Currency[] = [...CURRENCY_CODES];

export function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Format a major-unit DB numeric as `RWF 1,234,567`. */
export function money(value: unknown, currency: Currency = "RWF") {
  return formatMoney(toMinor(num(value), currency), currency);
}

export function qty(value: unknown) {
  return formatQuantity(num(value));
}

export const MEASUREMENT_METHODS = [
  { value: "area", label: "Area x coverage" },
  { value: "count", label: "Count" },
  { value: "linear", label: "Linear run" },
  { value: "volume", label: "Volume" },
  { value: "lump", label: "Lump sum" },
];

/** base quantity + wastage = billable quantity */
export function withWastage(base: number, wastagePct: number) {
  return quantityWithWastage(base, wastagePct);
}
