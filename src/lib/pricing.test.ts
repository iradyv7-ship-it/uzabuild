import { describe, expect, it } from "vitest";
import {
  applyPct,
  formatMoney,
  investorTerms,
  lineAmount,
  MoneyError,
  priceDelta,
  quantityWithWastage,
  rollUpBoq,
  roundClientTotal,
  sumMinor,
  toMajor,
  toMinor,
  vatOn,
  withMargin,
} from "./pricing";

describe("minor units", () => {
  it("keeps RWF as whole francs", () => {
    expect(toMinor(22_500_000)).toBe(22_500_000);
    expect(toMajor(22_500_000)).toBe(22_500_000);
  });

  it("converts USD to cents", () => {
    expect(toMinor(19.99, "USD")).toBe(1999);
    expect(toMajor(1999, "USD")).toBeCloseTo(19.99, 5);
  });

  it("rejects non-integer amounts", () => {
    expect(() => toMajor(10.5)).toThrow(MoneyError);
  });
});

describe("formatting", () => {
  it("formats RWF without decimals", () => {
    expect(formatMoney(1_234_567)).toBe("RWF 1,234,567");
  });

  it("formats USD with cents", () => {
    expect(formatMoney(1999, "USD")).toBe("USD 19.99");
  });
});

describe("line maths", () => {
  it("multiplies quantity by rate to whole minor units", () => {
    expect(lineAmount(12.5, 8_000)).toBe(100_000);
    expect(lineAmount(3.333, 1_000)).toBe(3_333);
  });

  it("adds wastage to a base quantity", () => {
    expect(quantityWithWastage(100, 10)).toBeCloseTo(110, 10);
    expect(quantityWithWastage(0, 10)).toBe(0);
  });

  it("sums amounts", () => {
    expect(sumMinor([100, 200, 300])).toBe(600);
  });

  it("applies percentages", () => {
    expect(applyPct(1_000_000, 18)).toBe(180_000);
    expect(withMargin(1_000_000, 20)).toBe(1_200_000);
    expect(vatOn(1_000_000)).toBe(180_000);
  });
});

describe("BOQ rollup", () => {
  it("carries preliminaries, contingency and VAT", () => {
    const t = rollUpBoq([1_000_000, 2_000_000], { preliminariesPct: 5, contingencyPct: 5 });
    expect(t.netMinor).toBe(3_000_000);
    expect(t.preliminariesMinor).toBe(150_000);
    expect(t.contingencyMinor).toBe(150_000);
    expect(t.subtotalMinor).toBe(3_300_000);
    expect(t.vatMinor).toBe(594_000);
    expect(t.grandTotalMinor).toBe(3_894_000);
  });

  it("returns zeros for an empty BOQ", () => {
    expect(rollUpBoq([]).grandTotalMinor).toBe(0);
  });
});

describe("client rounding and deltas", () => {
  it("rounds RWF totals up to the nearest thousand", () => {
    expect(roundClientTotal(3_894_001)).toBe(3_895_000);
    expect(roundClientTotal(3_894_000)).toBe(3_894_000);
  });

  it("reports a re-pricing delta", () => {
    expect(priceDelta(1_000_000, 1_100_000)).toEqual({ deltaMinor: 100_000, deltaPct: 10 });
    expect(priceDelta(0, 500).deltaPct).toBe(0);
  });
});

describe("investor formula", () => {
  it("derives landing cost and a return inside the accepted band", () => {
    const t = investorTerms(25_000_000);
    expect(t.landingCostMinor).toBe(21_667_500);
    expect(t.marginMinor).toBe(3_332_500);
    expect(t.investorShareMinor).toBe(2_166_125);
    expect(t.uzaShareMinor).toBe(1_166_375);
    expect(t.investorReturnPct).toBeGreaterThanOrEqual(10.0);
    expect(t.investorReturnPct).toBeLessThanOrEqual(10.4);
  });

  it("keeps the UZA fixed vehicle price consistent", () => {
    const t = investorTerms(22_500_000);
    expect(t.investorShareMinor + t.uzaShareMinor).toBe(t.marginMinor);
    expect(t.landingCostMinor + t.marginMinor).toBe(22_500_000);
  });
});
