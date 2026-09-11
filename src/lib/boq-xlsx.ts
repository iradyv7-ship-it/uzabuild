/**
 * Excel export of a project Bill of Quantities.
 *
 * Sheet 1 "BOQ" is the full hierarchy — house, floor, room, line — with the
 * catalog item, its catalog rate, the base quantity, the wastage that was
 * applied and the billable quantity.
 * Sheet 2 "Summary" rolls the same figures up per house, floor and room.
 *
 * No money literal lives here: rates and amounts are passed in already
 * computed by the caller, which uses src/lib/pricing.ts.
 */
import * as XLSX from "xlsx";

export type XlsxLine = {
  house: string;
  floor: string;
  room: string;
  description: string;
  catalogItem: string;
  supplier: string;
  unit: string;
  measurementMethod: string;
  measurementNote: string;
  baseQuantity: number;
  wastagePct: number;
  quantity: number;
  catalogRate: number;
  /** Set when the line was pinned to a rate different from the catalog. */
  pinnedRate: number | null;
  appliedRate: number;
  amount: number;
};

export type XlsxRollup = { level: string; name: string; parent: string; amount: number };

export type BoqWorkbookInput = {
  projectName: string;
  clientName: string;
  location: string;
  currency: string;
  generatedBy: string;
  generatedAt: Date;
  lines: XlsxLine[];
  rollups: XlsxRollup[];
  projectTotal: number;
  /** Blank-rate copy for a supplier to price. */
  withRates: boolean;
};

function autoWidth(rows: (string | number | null)[][]) {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = String(cell ?? "").length + 2;
      if (!widths[i] || widths[i]! < len) widths[i] = Math.min(len, 48);
    });
  }
  return widths.map((w) => ({ wch: w }));
}

export function buildBoqWorkbook(input: BoqWorkbookInput): XLSX.WorkBook {
  const { withRates, currency } = input;

  const header = [
    "House",
    "Floor",
    "Room",
    "Description",
    "Catalog item",
    "Supplier",
    "Unit",
    "Measurement method",
    "Measurement note",
    "Base quantity",
    "Wastage %",
    "Billable quantity",
    ...(withRates
      ? [`Catalog rate (${currency})`, `Applied rate (${currency})`, `Amount (${currency})`]
      : [`Rate (${currency})`, `Amount (${currency})`]),
  ];

  const body = input.lines.map((l) => [
    l.house,
    l.floor,
    l.room,
    l.description,
    l.catalogItem,
    l.supplier,
    l.unit,
    l.measurementMethod,
    l.measurementNote,
    l.baseQuantity,
    l.wastagePct,
    l.quantity,
    ...(withRates ? [l.catalogRate, l.appliedRate, l.amount] : ["", ""]),
  ]);

  const meta = [
    ["UZA Build — Bill of Quantities"],
    ["Project", input.projectName],
    ["Client", input.clientName],
    ["Location", input.location],
    ["Currency", currency],
    ["Prepared by", input.generatedBy],
    ["Prepared", input.generatedAt.toISOString().slice(0, 16).replace("T", " ") + " UTC"],
    withRates
      ? ["Note", "Rates are the catalog rates pinned on this project at the time of export."]
      : ["Note", "Blank-rate copy: quantities only, for a supplier to price."],
    [],
  ];

  const rows = [...meta, header, ...body];
  if (withRates) rows.push([], ["", "", "", "", "", "", "", "", "", "", "", "Project total", "", "", input.projectTotal]);

  const boqSheet = XLSX.utils.aoa_to_sheet(rows as (string | number)[][]);
  boqSheet["!cols"] = autoWidth(rows as (string | number)[][]);
  boqSheet["!freeze"] = { xSplit: 0, ySplit: meta.length + 1 };

  const summaryRows: (string | number)[][] = [
    ["Level", "Name", "Within", withRates ? `Amount (${currency})` : "Lines"],
    ...input.rollups.map((r) => [r.level, r.name, r.parent, r.amount]),
  ];
  if (withRates) summaryRows.push([], ["Project", input.projectName, "", input.projectTotal]);
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = autoWidth(summaryRows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, boqSheet, "BOQ");
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
  return wb;
}

export function downloadBoqWorkbook(input: BoqWorkbookInput) {
  const wb = buildBoqWorkbook(input);
  const safe = input.projectName.replace(/[^\w\-. ]+/g, "").trim() || "project";
  XLSX.writeFile(wb, `${safe}${input.withRates ? "" : " (blank rate)"} BOQ.xlsx`);
}
