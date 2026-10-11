/**
 * Like-for-like comparison of factory quotations on one package.
 *
 * Rows are the RFQ schedule items every factory was asked to price (plus one
 * "extras" row per factory for anything it added); columns are factories.
 * Mixed currencies are normalised to USD at the UZA basis
 * (FX_FALLBACK_RMB_PER_USD) — the same rate a client proforma starts from —
 * so "cheapest" means cheapest on the basis UZA actually prices on.
 * Pure: no I/O, all money in integer minor units.
 */
import { FX_FALLBACK_RMB_PER_USD, type CurrencyCode } from "@/config/policy";

export type ScheduleItem = {
  item: string;
  description: string;
  unit: string;
  quantity: number;
};

export type CompareQuote = {
  quoteId: string;
  supplierId: string;
  supplierName: string;
  status: string;
  currency: CurrencyCode;
  leadTimeDays: number | null;
  moqNote: string | null;
  validUntil: string | null;
  incoterm: string | null;
  sampleAvailable: boolean | null;
};

export type CompareLine = {
  quoteId: string;
  scheduleKey: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  unitPriceMinor: number | null;
};

export type CellFlag = "missing" | "no_price" | "qty_mismatch" | "unit_mismatch";

export type Cell = {
  unitPriceMinor: number | null;
  quantity: number | null;
  lineTotalMinor: number | null;
  /** Unit price in USD minor units at the UZA basis, for ranking. */
  unitPriceUsdMinor: number | null;
  lineTotalUsdMinor: number | null;
  flags: CellFlag[];
  cheapest: boolean;
};

export type MatrixRow = {
  item: string;
  description: string;
  unit: string;
  quantity: number;
  cells: Record<string, Cell>;
};

export type SupplierSummary = {
  quoteId: string;
  supplierId: string;
  supplierName: string;
  status: string;
  currency: CurrencyCode;
  totalMinor: number;
  totalUsdMinor: number;
  /** Items priced with a quantity, out of the schedule. */
  pricedItems: number;
  coveragePct: number;
  extras: { description: string; lineTotalUsdMinor: number | null }[];
  extrasUsdMinor: number;
  leadTimeDays: number | null;
  moqNote: string | null;
  validUntil: string | null;
  incoterm: string | null;
  sampleAvailable: boolean | null;
  /** True when every schedule item is priced. */
  complete: boolean;
  cheapestOverall: boolean;
  fastest: boolean;
};

export type QuoteMatrix = {
  rows: MatrixRow[];
  suppliers: SupplierSummary[];
  basisRmbPerUsd: number;
};

/** Converts minor units of a currency into USD minor units at the UZA basis. */
export function toUsdMinorAtBasis(
  minor: number,
  currency: CurrencyCode,
  rmbPerUsd: number = FX_FALLBACK_RMB_PER_USD,
  rwfPerUsd: number | null = null,
): number | null {
  if (currency === "USD") return minor;
  if (currency === "CNY") return Math.round(minor / rmbPerUsd);
  // RWF has no minor unit; only convertible when a rate is supplied.
  if (rwfPerUsd && rwfPerUsd > 0) return Math.round((minor * 100) / rwfPerUsd);
  return null;
}

function normUnit(u: string | null | undefined): string {
  return (u ?? "")
    .toLowerCase()
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/[\s.]/g, "")
    .replace(/^(sqm|m\^2)$/, "m2")
    .replace(/^(nr|no|pc|pcs|piece|pieces|each|ea)$/, "no");
}

export function buildQuoteMatrix(
  schedule: readonly ScheduleItem[],
  quotes: readonly CompareQuote[],
  lines: readonly CompareLine[],
  options: { rmbPerUsd?: number; rwfPerUsd?: number | null } = {},
): QuoteMatrix {
  const basis = options.rmbPerUsd ?? FX_FALLBACK_RMB_PER_USD;
  const rwf = options.rwfPerUsd ?? null;
  const live = quotes.filter((q) => q.status !== "withdrawn");

  const rows: MatrixRow[] = schedule.map((s) => ({
    item: s.item,
    description: s.description,
    unit: s.unit,
    quantity: s.quantity,
    cells: {},
  }));

  const summaries: SupplierSummary[] = live.map((q) => {
    const mine = lines.filter((l) => l.quoteId === q.quoteId);
    let total = 0;
    let totalUsd = 0;
    let priced = 0;

    for (const row of rows) {
      // A factory may split one item over several lines: sum them.
      const matched = mine.filter((l) => l.scheduleKey === row.item);
      const flags: CellFlag[] = [];
      if (matched.length === 0) {
        flags.push("missing");
        row.cells[q.quoteId] = {
          unitPriceMinor: null,
          quantity: null,
          lineTotalMinor: null,
          unitPriceUsdMinor: null,
          lineTotalUsdMinor: null,
          flags,
          cheapest: false,
        };
        continue;
      }
      const qty = matched.reduce<number | null>(
        (s, l) => (l.quantity === null ? s : (s ?? 0) + Number(l.quantity)),
        null,
      );
      const withPrice = matched.filter((l) => l.unitPriceMinor !== null);
      let lineTotal: number | null = null;
      for (const l of withPrice) {
        // Quote quantity when given; otherwise the schedule quantity asked for.
        const q2 =
          l.quantity !== null ? Number(l.quantity) : matched.length === 1 ? row.quantity : null;
        if (q2 === null) continue;
        lineTotal = (lineTotal ?? 0) + Math.round(q2 * (l.unitPriceMinor as number));
      }
      const unitPrice =
        withPrice.length === 1
          ? (withPrice[0]!.unitPriceMinor as number)
          : lineTotal !== null && (qty ?? row.quantity) > 0
            ? Math.round(lineTotal / (qty ?? row.quantity))
            : null;
      if (withPrice.length === 0) flags.push("no_price");
      if (qty !== null && row.quantity > 0 && Math.abs(qty - row.quantity) / row.quantity > 0.01) {
        flags.push("qty_mismatch");
      }
      const u = matched.find((l) => l.unit)?.unit ?? null;
      if (u && row.unit && normUnit(u) !== normUnit(row.unit)) flags.push("unit_mismatch");

      const unitUsd =
        unitPrice === null ? null : toUsdMinorAtBasis(unitPrice, q.currency, basis, rwf);
      const totalUsdLine =
        lineTotal === null ? null : toUsdMinorAtBasis(lineTotal, q.currency, basis, rwf);
      if (lineTotal !== null) {
        total += lineTotal;
        priced += 1;
      }
      if (totalUsdLine !== null) totalUsd += totalUsdLine;
      row.cells[q.quoteId] = {
        unitPriceMinor: unitPrice,
        quantity: qty,
        lineTotalMinor: lineTotal,
        unitPriceUsdMinor: unitUsd,
        lineTotalUsdMinor: totalUsdLine,
        flags,
        cheapest: false,
      };
    }

    const extras = mine
      .filter((l) => l.scheduleKey === null || !rows.some((r) => r.item === l.scheduleKey))
      .map((l) => {
        const t =
          l.unitPriceMinor !== null && l.quantity !== null
            ? Math.round(Number(l.quantity) * l.unitPriceMinor)
            : null;
        return {
          description: l.description,
          lineTotalUsdMinor: t === null ? null : toUsdMinorAtBasis(t, q.currency, basis, rwf),
        };
      });

    return {
      quoteId: q.quoteId,
      supplierId: q.supplierId,
      supplierName: q.supplierName,
      status: q.status,
      currency: q.currency,
      totalMinor: total,
      totalUsdMinor: totalUsd,
      pricedItems: priced,
      coveragePct: rows.length === 0 ? 0 : Math.round((priced / rows.length) * 100),
      extras,
      extrasUsdMinor: extras.reduce((s, e) => s + (e.lineTotalUsdMinor ?? 0), 0),
      leadTimeDays: q.leadTimeDays,
      moqNote: q.moqNote,
      validUntil: q.validUntil,
      incoterm: q.incoterm,
      sampleAvailable: q.sampleAvailable,
      complete: rows.length > 0 && priced === rows.length,
      cheapestOverall: false,
      fastest: false,
    };
  });

  // Cheapest per row, on the USD basis.
  for (const row of rows) {
    const priced = Object.entries(row.cells).filter(([, c]) => c.unitPriceUsdMinor !== null);
    if (priced.length < 2) continue;
    const min = Math.min(...priced.map(([, c]) => c.unitPriceUsdMinor as number));
    for (const [, c] of priced) c.cheapest = c.unitPriceUsdMinor === min;
  }

  // Cheapest overall only among complete quotes — a cheap partial quote is not a winner.
  const complete = summaries.filter((s) => s.complete);
  if (complete.length >= 1) {
    const min = Math.min(...complete.map((s) => s.totalUsdMinor));
    for (const s of complete) s.cheapestOverall = s.totalUsdMinor === min && complete.length > 1;
  }
  const leads = summaries.filter((s) => s.leadTimeDays !== null);
  if (leads.length > 1) {
    const min = Math.min(...leads.map((s) => s.leadTimeDays as number));
    for (const s of leads) s.fastest = s.leadTimeDays === min;
  }

  return { rows, suppliers: summaries, basisRmbPerUsd: basis };
}

/** Parses the schedule jsonb stored on package_rfqs into typed rows. */
export function parseSchedule(value: unknown): ScheduleItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((r) => {
      const o = r as Record<string, unknown>;
      const item = o["item"];
      const quantity = Number(o["quantity"]);
      if (item === undefined || item === null) return null;
      return {
        item: String(item),
        description: String(o["description"] ?? ""),
        unit: String(o["unit"] ?? ""),
        quantity: Number.isFinite(quantity) ? quantity : 0,
      };
    })
    .filter((r): r is ScheduleItem => r !== null);
}
