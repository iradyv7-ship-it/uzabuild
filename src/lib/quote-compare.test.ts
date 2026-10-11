import { describe, expect, it } from "vitest";
import {
  buildQuoteMatrix,
  parseSchedule,
  toUsdMinorAtBasis,
  type CompareLine,
  type CompareQuote,
  type ScheduleItem,
} from "@/lib/quote-compare";

const schedule: ScheduleItem[] = [
  { item: "1", description: "Porcelain 60x120 grey", unit: "m2", quantity: 480 },
  { item: "2", description: "Skirting 80 mm", unit: "m", quantity: 210 },
];

function quote(id: string, over: Partial<CompareQuote> = {}): CompareQuote {
  return {
    quoteId: id,
    supplierId: `s-${id}`,
    supplierName: `Factory ${id}`,
    status: "parsed",
    currency: "CNY",
    leadTimeDays: null,
    moqNote: null,
    validUntil: null,
    incoterm: "FOB",
    sampleAvailable: null,
    ...over,
  };
}

function line(
  quoteId: string,
  key: string | null,
  qty: number | null,
  price: number | null,
  unit = "m2",
): CompareLine {
  return {
    quoteId,
    scheduleKey: key,
    description: `item ${key}`,
    unit,
    quantity: qty,
    unitPriceMinor: price,
  };
}

describe("toUsdMinorAtBasis", () => {
  it("converts CNY at the UZA basis of 6, not the market rate", () => {
    expect(toUsdMinorAtBasis(6000, "CNY")).toBe(1000);
  });
  it("passes USD through and leaves RWF unconverted without a rate", () => {
    expect(toUsdMinorAtBasis(1234, "USD")).toBe(1234);
    expect(toUsdMinorAtBasis(1000, "RWF")).toBeNull();
    expect(toUsdMinorAtBasis(1300, "RWF", 6, 1300)).toBe(100);
  });
});

describe("buildQuoteMatrix", () => {
  it("compares mixed currencies on the USD basis and marks the cheapest per row and overall", () => {
    const quotes = [quote("a"), quote("b", { currency: "USD" })];
    const lines = [
      line("a", "1", 480, 6000), // CNY 60.00 = USD 10.00
      line("a", "2", 210, 1200, "m"), // CNY 12.00 = USD 2.00
      line("b", "1", 480, 900), // USD 9.00
      line("b", "2", 210, 250, "m"), // USD 2.50
    ];
    const m = buildQuoteMatrix(schedule, quotes, lines);
    expect(m.rows[0]!.cells["b"]!.cheapest).toBe(true);
    expect(m.rows[0]!.cells["a"]!.cheapest).toBe(false);
    expect(m.rows[1]!.cells["a"]!.cheapest).toBe(true);
    const a = m.suppliers.find((s) => s.quoteId === "a")!;
    const b = m.suppliers.find((s) => s.quoteId === "b")!;
    expect(a.totalUsdMinor).toBe(480 * 1000 + 210 * 200);
    expect(b.totalUsdMinor).toBe(480 * 900 + 210 * 250);
    expect(b.cheapestOverall).toBe(true);
    expect(a.cheapestOverall).toBe(false);
    expect(a.coveragePct).toBe(100);
  });

  it("flags missing items and never crowns an incomplete quote cheapest overall", () => {
    const quotes = [quote("a"), quote("b")];
    const lines = [
      line("a", "1", 480, 100),
      line("b", "1", 480, 6000),
      line("b", "2", 210, 1200, "m"),
    ];
    const m = buildQuoteMatrix(schedule, quotes, lines);
    expect(m.rows[1]!.cells["a"]!.flags).toContain("missing");
    const a = m.suppliers.find((s) => s.quoteId === "a")!;
    expect(a.complete).toBe(false);
    expect(a.coveragePct).toBe(50);
    expect(a.cheapestOverall).toBe(false);
  });

  it("flags quantity and unit mismatches and missing prices", () => {
    const m = buildQuoteMatrix(
      schedule,
      [quote("a")],
      [line("a", "1", 400, 6000), line("a", "2", 210, null, "pcs")],
    );
    expect(m.rows[0]!.cells["a"]!.flags).toContain("qty_mismatch");
    expect(m.rows[1]!.cells["a"]!.flags).toEqual(
      expect.arrayContaining(["no_price", "unit_mismatch"]),
    );
  });

  it("uses the schedule quantity when a factory gives only a unit price", () => {
    const m = buildQuoteMatrix(schedule, [quote("a")], [line("a", "1", null, 6000)]);
    expect(m.rows[0]!.cells["a"]!.lineTotalMinor).toBe(480 * 6000);
  });

  it("sums split lines, lists extras and ignores withdrawn quotes", () => {
    const quotes = [quote("a"), quote("w", { status: "withdrawn" })];
    const lines = [
      line("a", "1", 240, 6000),
      line("a", "1", 240, 6600),
      line("a", null, 10, 600, "no"),
      line("w", "1", 480, 1),
    ];
    const m = buildQuoteMatrix(schedule, quotes, lines);
    expect(m.suppliers).toHaveLength(1);
    expect(m.rows[0]!.cells["a"]!.lineTotalMinor).toBe(240 * 6000 + 240 * 6600);
    expect(m.rows[0]!.cells["a"]!.quantity).toBe(480);
    expect(m.suppliers[0]!.extras).toHaveLength(1);
    expect(m.suppliers[0]!.extrasUsdMinor).toBe(1000);
  });

  it("marks the fastest lead time", () => {
    const m = buildQuoteMatrix(
      schedule,
      [quote("a", { leadTimeDays: 30 }), quote("b", { leadTimeDays: 45 })],
      [],
    );
    expect(m.suppliers.find((s) => s.quoteId === "a")!.fastest).toBe(true);
    expect(m.suppliers.find((s) => s.quoteId === "b")!.fastest).toBe(false);
  });
});

describe("parseSchedule", () => {
  it("reads the jsonb stored on package_rfqs and drops malformed rows", () => {
    expect(
      parseSchedule([
        { item: 1, description: "Tile", unit: "m2", quantity: "480" },
        { description: "no item" },
        "junk",
      ]),
    ).toEqual([{ item: "1", description: "Tile", unit: "m2", quantity: 480 }]);
    expect(parseSchedule(null)).toEqual([]);
  });
});
