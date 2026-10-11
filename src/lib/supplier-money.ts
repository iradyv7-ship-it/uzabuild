/**
 * Integer minor units ↔ a price a person types. CNY, USD and RWF in this app:
 * RWF has no minor unit, the other two have cents/fen.
 */
export function minorExponent(currency: string): number {
  return currency === "RWF" ? 0 : 2;
}

export function toMinorUnits(value: string, currency: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 10 ** minorExponent(currency));
}

export function fromMinorUnits(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "";
  const exp = minorExponent(currency);
  return (minor / 10 ** exp).toFixed(exp);
}
