/**
 * Pure maths for UZA-issued proformas.
 * Factory quotes arrive in RMB; the client is quoted in USD.
 * All money is integer minor units. No money literal lives here.
 */

import { RMB_PER_USD } from "@/config/discovery";
import { lineAmount, sumMinor, type Minor } from "@/lib/pricing";

export type ProformaLineInput = {
  quantity: number;
  unitPriceRmbMinor: Minor;
  unitPriceUsdMinor: Minor;
};

/** Convert an RMB minor amount to USD minor units at the working rate. */
export function rmbToUsdMinor(rmbMinor: Minor, rate: number = RMB_PER_USD): Minor {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round(rmbMinor / rate);
}

export type ProformaTotals = {
  totalRmbMinor: Minor;
  totalUsdMinor: Minor;
};

export function rollUpProforma(lines: readonly ProformaLineInput[]): ProformaTotals {
  return {
    totalRmbMinor: sumMinor(lines.map((l) => lineAmount(l.quantity, l.unitPriceRmbMinor))),
    totalUsdMinor: sumMinor(lines.map((l) => lineAmount(l.quantity, l.unitPriceUsdMinor))),
  };
}

/** Reference like UZA-PF-2609-0007 — stable, human-quotable. */
export function proformaReference(seq: number, at: Date = new Date()): string {
  const yy = String(at.getUTCFullYear()).slice(-2);
  const mm = String(at.getUTCMonth() + 1).padStart(2, "0");
  return `UZA-PF-${yy}${mm}-${String(seq).padStart(4, "0")}`;
}

/**
 * Factory quotations arrive with Chinese unit words. The client document is
 * English-only, so the common ones are spelled out; anything unknown is kept.
 */
const UNIT_WORDS: Record<string, string> = {
  "樘": "no.",
  "个": "no.",
  "件": "pcs",
  "套": "set",
  "台": "unit",
  "张": "sheet",
  "块": "pcs",
  "平方米": "m²",
  "平米": "m²",
  "米": "m",
  "延米": "lm",
  "吨": "t",
  "卷": "roll",
  "桶": "drum",
  "箱": "box",
};

export function englishUnit(unit: string): string {
  const key = unit.trim();
  return UNIT_WORDS[key] ?? key;
}
