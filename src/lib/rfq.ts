/**
 * The request for quotation UZA sends a manufacturer for one product package.
 *
 * Pure and deterministic on purpose. Everything a factory is told — the
 * reference, the specification, the quantity schedule, what to quote — is
 * built here from real rows, so it can be tested and so the AI polish step in
 * rfq.functions.ts never has the chance to invent a quantity: the schedule is
 * substituted back in after the model has written around it.
 *
 * ── WHAT NEVER REACHES A MANUFACTURER ────────────────────────────────────
 *   - the client's name, contact or company, the project name or its site
 *     location (shipping is always "Kigali, Rwanda")
 *   - any money: no BOQ rate, amount, target budget or UZA price
 *   - another manufacturer's name
 *   - uploaded file names (they routinely carry the client or project name):
 *     attachments are listed by kind and number only
 * Known names that still appear in typed notes are masked and reported.
 */
import { checkForForeignBranding } from "@/lib/confidentiality";
import { redactForManufacturer } from "@/lib/manufacturer-access";
import {
  MINIMUM_STANDARD,
  PACKAGE_REQUIREMENTS,
  categoryLabel,
  categoryNote,
  tierLabel,
} from "@/config/packages";

/** Where every UZA package ships to. Never the project site itself. */
export const RFQ_DESTINATION = "Kigali, Rwanda";

/** Placeholder the AI polish step must keep; the schedule is substituted back in after. */
export const SCHEDULE_TOKEN = "[[QUANTITY SCHEDULE]]";

/**
 * Which BOQ lines belong to which package: catalog category slugs, optionally
 * narrowed by keywords where one catalog category covers several packages
 * (flooring holds both tiles and carpet).
 */
export const PACKAGE_BOQ_MATCH: Record<string, { slugs: string[]; keywords?: string[] }> = {
  aluminium_windows_doors: { slugs: ["aluminium"] },
  interior_doors: { slugs: ["doors"] },
  tiles: {
    slugs: ["flooring", "sanitary"],
    keywords: [
      "tile",
      "porcelain",
      "ceramic",
      "mosaic",
      "terrazzo",
      "marble",
      "granite",
      "skirting",
    ],
  },
  carpets: { slugs: ["flooring"], keywords: ["carpet", "rug", "vinyl", "spc", "lvt", "laminate"] },
  acoustic_panels: { slugs: ["acoustics", "ceilings"], keywords: ["acoustic"] },
  wall_panels: { slugs: ["ceilings", "acoustics"], keywords: ["panel", "cladding", "wpc"] },
  lighting_conference: { slugs: ["lighting"] },
  lighting_residential: { slugs: ["lighting"] },
  lighting_solar_street: {
    slugs: ["solar", "lighting"],
    keywords: ["street", "solar", "pole", "flood"],
  },
  cabinetry: { slugs: ["kitchen"] },
  kitchen_equipment: {
    slugs: ["kitchen", "electronics"],
    keywords: ["oven", "hob", "hood", "fridge", "dishwasher", "equipment", "cooker"],
  },
  electronics: { slugs: ["electronics", "smart-home"] },
  sanitaryware: {
    slugs: ["sanitary"],
    keywords: [
      "wc",
      "toilet",
      "basin",
      "tap",
      "mixer",
      "shower",
      "bath",
      "urinal",
      "bidet",
      "sink",
      "sanitary",
    ],
  },
  furniture: {
    slugs: [],
    keywords: ["chair", "table", "sofa", "bed", "desk", "furniture", "wardrobe"],
  },
  hotel_textiles: {
    slugs: [],
    keywords: ["linen", "towel", "duvet", "pillow", "curtain", "textile", "bedding"],
  },
  other: { slugs: [] },
};

/**
 * Category-specific questions a factory must answer so two quotations can be
 * compared like-for-like. The AI polish step may phrase them better; it is
 * told to keep every one.
 */
export const CATEGORY_QUESTIONS: Record<string, string[]> = {
  tiles: [
    "Format and thickness (mm), rectified or non-rectified edges",
    "Surface finish and slip rating (R-value or DCOF) per item",
    "Water absorption and PEI abrasion class",
    "Shade/batch consistency: can the full quantity ship from one production batch?",
    "Matching trims, skirtings and step nosings available",
    "Box size, m² per box, boxes per pallet and pallet weight",
  ],
  carpets: [
    "Construction (tufted, woven, tile), pile weight and pile height",
    "Backing type and fire classification",
    "Roll width or tile size, and minimum quantity for a custom colourway",
  ],
  aluminium_windows_doors: [
    "Profile system and series, wall thickness, thermal break yes/no",
    "Glass build-up (e.g. 6+12A+6, laminated, tempered, low-e)",
    "Finish (powder coat or anodised), colour reference and coating thickness",
    "Hardware brand, opening types, wind-load and water-tightness performance",
    "Whether frames ship assembled or knocked-down, and installation drawings provided",
  ],
  interior_doors: [
    "Leaf construction and core, thickness, and finish",
    "Frame/architrave type, ironmongery included or not",
    "Fire or acoustic rating where specified, and handing per item",
  ],
  acoustic_panels: [
    "Tested absorption (NRC / αw) with the test report",
    "Substrate, thickness, fire classification",
    "Fixing system and the panel sizes available",
  ],
  wall_panels: [
    "Substrate, thickness and finish",
    "Fixing system, joints and edge trims",
    "Fire classification",
  ],
  lighting_conference: [
    "Wattage, lumen output and efficacy (lm/W) per luminaire",
    "Colour temperature (CCT) and CRI",
    "Driver brand, dimming protocol (DALI / 0-10V / triac) and power factor",
    "IP rating where relevant, beam angle and mounting type",
    "Certifications (CE, RoHS, CB) and warranty years",
  ],
  lighting_residential: [
    "Wattage, lumen output, CCT and CRI per fitting",
    "Dimming compatibility and driver type",
    "Finish and mounting, with product photos",
    "Certifications (CE, RoHS) and warranty years",
  ],
  lighting_solar_street: [
    "Panel wattage, battery type and capacity (Wh), and autonomy nights",
    "Lumen output, LED chip and driver/controller brand",
    "IP and IK rating, pole height and wind rating",
    "Warranty on battery, panel and luminaire separately",
  ],
  cabinetry: [
    "Carcass and door material, thickness and edge banding",
    "Finish and colour reference, hardware brand (hinges, runners)",
    "Worktop material and thickness",
    "Whether units ship flat-packed with assembly drawings",
  ],
  furniture: [
    "Frame and upholstery materials",
    "Dimensions per item and fire compliance where required",
  ],
  electronics: [
    "Model numbers, power supply (230 V / 50 Hz)",
    "Warranty and local service support",
  ],
  kitchen_equipment: [
    "Model numbers, power/gas rating at 230 V / 50 Hz",
    "Spare parts availability and warranty",
  ],
  hotel_textiles: [
    "Composition, GSM and thread count",
    "Sizes per item and laundry-cycle durability",
  ],
  sanitaryware: [
    "Model number, dimensions and rough-in per fitting",
    "Flush type and volume, trap type",
    "Tapware finish, cartridge brand and working pressure range",
    "Certifications and warranty years",
  ],
};

export type RfqPackage = {
  package_code: string | null;
  category: string;
  title: string;
  scope_note: string | null;
  quality_tier: string;
  priority: number;
  phase: number;
  required_delivery_date: string | null;
  style_note: string | null;
  colour_note: string | null;
  shape_note: string | null;
  pattern_note: string | null;
  texture_note: string | null;
  finish_note: string | null;
  performance_note: string | null;
};

export type RfqRequirement = { requirement_key: string; status: string };
export type RfqAttachment = { kind: string; mime_type: string | null };

export type RfqBoqLine = {
  description: string;
  unit: string;
  quantity: number;
  catalogSlug: string | null;
  catalogItemName: string | null;
  /** Room/floor/house names; never the project or client. */
  locationLabel: string | null;
  /** How many identical houses the line's room repeats across. */
  multiplier: number;
};

/** Names that must never appear in a manufacturer-facing message. */
export type RfqSensitiveNames = {
  clientName?: string | null;
  clientContact?: string | null;
  projectName?: string | null;
  projectLocation?: string | null;
  otherManufacturers?: readonly (string | null)[];
};

export type RfqScheduleRow = {
  item: string;
  description: string;
  unit: string;
  quantity: number;
  location: string | null;
};

export type RfqDraft = {
  reference: string;
  subject: string;
  /** English body with SCHEDULE_TOKEN where the schedule goes. */
  body: string;
  schedule: RfqScheduleRow[];
  warnings: string[];
};

function lineMatches(line: RfqBoqLine, category: string): boolean {
  const rule = PACKAGE_BOQ_MATCH[category];
  if (!rule) return false;
  const text = `${line.description} ${line.catalogItemName ?? ""}`.toLowerCase();
  const slugOk =
    rule.slugs.length === 0 || (line.catalogSlug !== null && rule.slugs.includes(line.catalogSlug));
  const keywordOk = !rule.keywords || rule.keywords.some((k) => text.includes(k));
  // Packages with no catalog category (furniture, textiles) match on keywords alone.
  if (rule.slugs.length === 0) return Boolean(rule.keywords) && keywordOk;
  return slugOk && keywordOk;
}

/** BOQ lines that belong to this package, merged when the same item repeats across rooms. */
export function scheduleFor(category: string, lines: readonly RfqBoqLine[]): RfqScheduleRow[] {
  const merged = new Map<string, RfqScheduleRow>();
  for (const line of lines) {
    if (!lineMatches(line, category)) continue;
    const description = line.description.trim();
    const key = `${description.toLowerCase()}|${line.unit.toLowerCase()}`;
    const quantity = roundQty(Number(line.quantity) * Math.max(1, line.multiplier));
    const existing = merged.get(key);
    if (existing) {
      existing.quantity = roundQty(existing.quantity + quantity);
      if (
        line.locationLabel &&
        existing.location &&
        !existing.location.includes(line.locationLabel)
      ) {
        existing.location = `${existing.location}; ${line.locationLabel}`;
      }
    } else {
      merged.set(key, {
        item: "",
        description,
        unit: line.unit,
        quantity,
        location: line.locationLabel,
      });
    }
  }
  return [...merged.values()].map((row, i) => ({ ...row, item: String(i + 1).padStart(2, "0") }));
}

function roundQty(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Replace every known sensitive name with a neutral word; report what was masked. */
export function maskSensitive(
  text: string,
  names: RfqSensitiveNames,
): { text: string; masked: string[] } {
  const candidates: [string | null | undefined, string][] = [
    [names.clientName, "the client"],
    [names.clientContact, "the client"],
    [names.projectName, "the project"],
    [names.projectLocation, "site"],
    ...(names.otherManufacturers ?? []).map((n): [string | null, string] => [
      n,
      "another supplier",
    ]),
  ];
  const found = checkForForeignBranding(
    text,
    candidates.map(([n]) => n),
  );
  let out = text;
  for (const match of found.matches) {
    const replacement = candidates.find(([n]) => n?.trim() === match)?.[1] ?? "[removed]";
    out = out.replace(new RegExp(escapeRegExp(match), "gi"), replacement);
  }
  return { text: out, masked: found.matches };
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function attachmentLine(attachments: readonly RfqAttachment[]): string[] {
  const counts = new Map<string, number>();
  for (const a of attachments) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
  const label = (k: string) => k.replace(/_/g, " ");
  return [...counts.entries()].map(([kind, n]) => `- ${n} × ${label(kind)}`);
}

/**
 * Build the English RFQ for one package. `salutation` is the manufacturer
 * being addressed (their own name is fine to use); everything else is
 * stripped of client, project and money.
 */
export function buildRfq(input: {
  pkg: RfqPackage;
  requirements: readonly RfqRequirement[];
  attachments: readonly RfqAttachment[];
  boqLines: readonly RfqBoqLine[];
  names: RfqSensitiveNames;
  salutation?: string | null;
  today?: Date;
}): RfqDraft {
  // The client's identity and price must not survive even if a caller passes them along.
  const safe = redactForManufacturer({ ...input, clientName: undefined, usdPriceMinor: undefined });
  const { pkg, requirements, attachments, boqLines, names } = safe;
  const warnings: string[] = [];

  const reference = pkg.package_code?.trim() || `UZA-PKG-${pkg.category.toUpperCase()}`;
  const family = categoryLabel(pkg.category);
  const schedule = scheduleFor(pkg.category, boqLines);

  if (schedule.length === 0) {
    warnings.push(
      "No BOQ line matches this package, so the RFQ has no quantity schedule. Add the lines to the BOQ (with a catalog item in the right category) or type the quantities into the message.",
    );
  }
  const zeroQty = schedule.filter((r) => !(r.quantity > 0));
  if (zeroQty.length > 0) {
    warnings.push(
      `${zeroQty.length} schedule line(s) have no quantity: ${zeroQty.map((r) => r.item).join(", ")}.`,
    );
  }

  for (const def of PACKAGE_REQUIREMENTS) {
    if (!def.blocksSourcing) continue;
    const status = requirements.find((r) => r.requirement_key === def.key)?.status ?? "missing";
    if (status !== "provided" && status !== "not_applicable") {
      warnings.push(`Still missing before sourcing: ${def.label}.`);
    }
  }

  const spec: [string, string | null][] = [
    ["Style", pkg.style_note],
    ["Colour", pkg.colour_note],
    ["Shape / form", pkg.shape_note],
    ["Pattern", pkg.pattern_note],
    ["Texture", pkg.texture_note],
    ["Surface finish", pkg.finish_note],
    ["Performance", pkg.performance_note],
  ];
  const specLines = spec.filter(([, v]) => v && v.trim()).map(([k, v]) => `- ${k}: ${v!.trim()}`);
  if (specLines.length === 0)
    warnings.push("No design direction or performance standard is recorded on this package.");

  const questions = CATEGORY_QUESTIONS[pkg.category] ?? [];
  const delivery = pkg.required_delivery_date
    ? `Goods are required on site in ${RFQ_DESTINATION} by ${formatDate(pkg.required_delivery_date)}. Please state your production lead time so we can plan sea freight backwards from this date.`
    : `Please state your production lead time; the on-site date in ${RFQ_DESTINATION} will be confirmed with the order.`;

  const sections = [
    `Dear ${input.salutation?.trim() || "Supplier"},`,
    "",
    `UZA Build invites you to quote for the package below. Please reply quoting our reference ${reference} on every document.`,
    "",
    `REFERENCE: ${reference}`,
    `PRODUCT FAMILY: ${family}`,
    `PACKAGE: ${pkg.title.trim()}`,
    `QUALITY LEVEL: ${tierLabel(pkg.quality_tier)}`,
    `DELIVERY: ${RFQ_DESTINATION}`,
    "",
    ...(pkg.scope_note?.trim() ? ["SCOPE", pkg.scope_note.trim(), ""] : []),
    "SPECIFICATION",
    ...(specLines.length
      ? specLines
      : ["- To be confirmed with the attached drawings and references."]),
    `- What a quotation for this family must address: ${categoryNote(pkg.category)}`,
    "",
    "QUANTITY SCHEDULE",
    SCHEDULE_TOKEN,
    "",
    ...(attachments.length ? ["ATTACHED", ...attachmentLine(attachments), ""] : []),
    "PLEASE QUOTE, PER ITEM",
    "- Unit price (state FOB port or EXW, and the currency)",
    "- Minimum order quantity",
    "- Production lead time from deposit",
    "- Sample availability and sample lead time",
    "- Packing per unit/carton, carton dimensions and gross weight, suitable for sea freight",
    "- Certificates and test reports available",
    "- Warranty, written on the proforma",
    "- Payment terms",
    ...(questions.length ? ["", "ALSO CONFIRM", ...questions.map((q) => `- ${q}`)] : []),
    "",
    "DELIVERY TARGET",
    delivery,
    "",
    "OUR MINIMUM STANDARD",
    ...MINIMUM_STANDARD.map((s) => `- ${s}`),
    "",
    "HOW TO REPLY",
    `Reply with a proforma or quotation in PDF or Excel, quoting ${reference} and the item numbers from the schedule above. Do not substitute a different product without saying so on the quotation.`,
    "",
    "Thank you,",
    "UZA Build — Sourcing",
  ];

  const masked = maskSensitive(sections.join("\n"), names);
  if (masked.masked.length > 0) {
    warnings.push(
      `Removed names that must not reach a manufacturer: ${masked.masked.join(", ")}. Check the notes on this package.`,
    );
  }
  const maskedSchedule = schedule.map((row) => ({
    ...row,
    description: maskSensitive(row.description, names).text,
    location: row.location ? maskSensitive(row.location, names).text : null,
  }));

  return {
    reference,
    subject: maskSensitive(`RFQ ${reference} — ${family} — ${pkg.title.trim()}`, names).text.slice(
      0,
      200,
    ),
    body: masked.text,
    schedule: maskedSchedule,
    warnings,
  };
}

function formatDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
}

const ZH_HEADERS = {
  item: "序号",
  description: "描述",
  unit: "单位",
  quantity: "数量",
  location: "位置",
};
const EN_HEADERS = {
  item: "Item",
  description: "Description",
  unit: "Unit",
  quantity: "Quantity",
  location: "Location",
};

/** A plain-text table that survives email, WeChat and copy-paste. */
export function renderSchedule(
  rows: readonly RfqScheduleRow[],
  lang: "en" | "zh",
  translatedDescriptions?: readonly string[],
): string {
  if (rows.length === 0) {
    return lang === "zh" ? "（数量清单待补充）" : "(Quantity schedule to follow.)";
  }
  const h = lang === "zh" ? ZH_HEADERS : EN_HEADERS;
  const lines = rows.map((r, i) => {
    const description =
      lang === "zh" && translatedDescriptions?.[i]
        ? `${translatedDescriptions[i]} (${r.description})`
        : r.description;
    const location = r.location ? ` | ${r.location}` : "";
    return `${r.item} | ${description} | ${r.unit} | ${formatQty(r.quantity)}${location}`;
  });
  const hasLocation = rows.some((r) => r.location);
  return [
    `${h.item} | ${h.description} | ${h.unit} | ${h.quantity}${hasLocation ? ` | ${h.location}` : ""}`,
    ...lines,
  ].join("\n");
}

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Put the deterministic schedule back where the token is (or append it if the token was lost). */
export function insertSchedule(
  body: string,
  schedule: string,
): { text: string; tokenFound: boolean } {
  if (body.includes(SCHEDULE_TOKEN))
    return { text: body.replace(SCHEDULE_TOKEN, schedule), tokenFound: true };
  return { text: `${body.trimEnd()}\n\n${schedule}`, tokenFound: false };
}
