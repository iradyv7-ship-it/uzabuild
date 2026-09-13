import { describe, expect, it } from "vitest";
import { validateBoqLines } from "./translate.functions";

describe("validateBoqLines", () => {
  it("accepts a well-formed batch and normalises missing specification to null", () => {
    const result = validateBoqLines({
      direction: "en_to_zh",
      lines: [
        { description: "Porcelain floor tile", unit: "m2", quantity: 120 },
        { description: "Solid oak door leaf", specification: "45mm, veneered", unit: "no.", quantity: 8 },
      ],
    });
    expect(result.direction).toBe("en_to_zh");
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]?.specification).toBeNull();
    expect(result.lines[1]?.specification).toBe("45mm, veneered");
    // Quantities and units are passed through untouched, never coerced.
    expect(result.lines[0]?.quantity).toBe(120);
    expect(result.lines[0]?.unit).toBe("m2");
  });

  it("rejects an empty batch", () => {
    expect(() => validateBoqLines({ direction: "en_to_zh", lines: [] })).toThrow();
  });

  it("rejects an unsupported direction", () => {
    expect(() =>
      validateBoqLines({ direction: "fr_to_en", lines: [{ description: "x", unit: "no.", quantity: 1 }] }),
    ).toThrow();
  });

  it("rejects a line with no description", () => {
    expect(() =>
      validateBoqLines({ direction: "zh_to_en", lines: [{ description: "", unit: "no.", quantity: 1 }] }),
    ).toThrow(/description/);
  });

  it("rejects a line with no unit", () => {
    expect(() =>
      validateBoqLines({ direction: "zh_to_en", lines: [{ description: "Tile", unit: "", quantity: 1 }] }),
    ).toThrow(/unit/);
  });

  it("rejects a line with a non-numeric quantity", () => {
    expect(() =>
      validateBoqLines({
        direction: "zh_to_en",
        lines: [{ description: "Tile", unit: "m2", quantity: Number.NaN }],
      }),
    ).toThrow(/quantity/);
  });

  it("rejects more than 500 lines in one request", () => {
    const lines = Array.from({ length: 501 }, () => ({ description: "Tile", unit: "m2", quantity: 1 }));
    expect(() => validateBoqLines({ direction: "en_to_zh", lines })).toThrow(/Too many/);
  });
});
