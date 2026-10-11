import { describe, expect, it } from "vitest";
import { fromMinorUnits, minorExponent, toMinorUnits } from "./supplier-money";

describe("supplier money helpers", () => {
  it("uses no minor unit for RWF and cents/fen for CNY and USD", () => {
    expect(minorExponent("RWF")).toBe(0);
    expect(minorExponent("CNY")).toBe(2);
    expect(minorExponent("USD")).toBe(2);
  });

  it("converts a typed price to integer minor units", () => {
    expect(toMinorUnits("58.00", "CNY")).toBe(5800);
    expect(toMinorUnits("1,250.5", "USD")).toBe(125050);
    expect(toMinorUnits("12500", "RWF")).toBe(12500);
    expect(toMinorUnits("0.1", "CNY")).toBe(10);
  });

  it("treats blank as unknown and rejects nonsense or negatives", () => {
    expect(toMinorUnits("", "CNY")).toBeNull();
    expect(toMinorUnits("  ", "CNY")).toBeNull();
    expect(toMinorUnits("abc", "CNY")).toBeNull();
    expect(toMinorUnits("-3", "CNY")).toBeNull();
  });

  it("formats minor units back for an input field", () => {
    expect(fromMinorUnits(5800, "CNY")).toBe("58.00");
    expect(fromMinorUnits(12500, "RWF")).toBe("12500");
    expect(fromMinorUnits(null, "CNY")).toBe("");
    expect(fromMinorUnits(undefined, "USD")).toBe("");
  });

  it("round-trips", () => {
    for (const v of ["0.01", "3.50", "99999.99"]) {
      expect(fromMinorUnits(toMinorUnits(v, "USD"), "USD")).toBe(v);
    }
  });
});
