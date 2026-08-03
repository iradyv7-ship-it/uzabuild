export type Currency = "RWF" | "USD" | "CNY";

export const CURRENCIES: Currency[] = ["RWF", "USD", "CNY"];

export function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function money(value: unknown, currency: Currency = "RWF") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "RWF" ? 0 : 2,
  }).format(num(value));
}

export function qty(value: unknown) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(num(value));
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
  return base * (1 + wastagePct / 100);
}
