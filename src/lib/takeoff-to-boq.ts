/**
 * Takeoff → BOQ planning, as a pure function.
 *
 * Reviewed takeoff lines (a QS accepted or corrected the quantity) become BOQ
 * lines placed in the Project → House → Floor → Room hierarchy, without anyone
 * retyping a quantity. This module only decides; it never writes. The plan it
 * returns is shown to the QS for confirmation and then written by
 * src/services/takeoffToBoqService.ts.
 *
 * Rules:
 *  - Only reviewed lines (status accepted/corrected) are sent; drafts and
 *    rejected lines never are. The reviewed human quantity wins over the AI one.
 *  - A takeoff line already linked to a BOQ line (boq_lines.takeoff_line_id) is
 *    skipped, so sending twice never duplicates a line.
 *  - "Opening area deducted" lines are information only: the wall area the
 *    reader reports is already net of openings.
 *  - A catalog item is attached only when exactly one active item fits (same
 *    category family and a compatible unit). Anything else is left empty and
 *    flagged for the QS to choose — never guessed.
 */
import { withWastage } from "@/lib/boq";

export type TakeoffInput = {
  id: string;
  description: string;
  unit: string;
  measurement_method: string | null;
  material_category: string | null;
  ai_quantity: number | string | null;
  human_quantity: number | string | null;
  status: string;
  catalog_item_id: string | null;
  ai_source: string | null;
};

export type HouseInput = { id: string; name: string; sort_order: number };
export type FloorInput = { id: string; house_id: string; name: string; level: number };
export type RoomInput = { id: string; floor_id: string; name: string };
export type CatalogItemInput = {
  id: string;
  category_id: string;
  name: string;
  unit: string;
  default_wastage_pct: number | string | null;
  is_active: boolean;
};
export type CategoryInput = { id: string; name: string; slug: string };

/** Where a planned line lands: an existing room, or one the plan creates. */
export type RoomOption = {
  key: string;
  label: string;
  existing: boolean;
};

export type NewHouse = { key: string; name: string };
export type NewFloor = { key: string; name: string; level: number; houseRef: string };
export type NewRoom = {
  key: string;
  name: string;
  floorRef: string;
  floor_area_m2: number;
  wall_area_m2: number;
  perimeter_m: number;
};

export type PlannedLine = {
  takeoffLineId: string;
  label: string;
  roomKey: string;
  catalogItemId: string | null;
  suggestedCategoryId: string | null;
  needsCatalogItem: boolean;
  unit: string;
  measurementMethod: string;
  baseQuantity: number;
  wastagePct: number;
  quantity: number;
  note: string;
};

export type SkipReason =
  "already_in_boq" | "not_reviewed" | "rejected" | "no_quantity" | "deduction";

export type TakeoffPlan = {
  newHouse: NewHouse | null;
  newFloors: NewFloor[];
  newRooms: NewRoom[];
  roomOptions: RoomOption[];
  lines: PlannedLine[];
  skipped: { takeoffLineId: string; label: string; reason: SkipReason }[];
};

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  already_in_boq: "Already in the BOQ",
  not_reviewed: "Not reviewed yet",
  rejected: "Rejected",
  no_quantity: "No quantity",
  deduction: "Deduction (already netted from the wall area)",
};

const REVIEWED = new Set(["accepted", "corrected"]);
const BOQ_METHODS = new Set(["area", "count", "linear", "volume", "lump"]);

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

export function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

const ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

export type ParsedLevel = { key: string; level: number; name: string };

/**
 * Reads a floor/level label the way it appears on drawings and in hand-made
 * BOQs: "Ground floor", "GF", "G/F", "Level 0", "RDC", "First floor", "1st
 * floor", "L2", "Basement", "B1", "Roof". Returns null for anything it does
 * not recognise as a level.
 */
export function parseLevel(label: string): ParsedLevel | null {
  const raw = label.trim().toLowerCase();
  if (!raw) return null;
  const s = raw
    .replace(/[^a-z0-9-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const named = (level: number): ParsedLevel => ({
    key: `L${level}`,
    level,
    name: levelName(level),
  });

  if (/^(ground( floor| level)?|gf|g f|g|rdc|rez de chaussee|level 0|lvl 0|l0|floor 0|f0)$/.test(s))
    return named(0);
  if (/^(basement( floor)?|b|b1|level -1|l-1|lower ground( floor)?|lg|lgf)$/.test(s))
    return named(-1);
  if (/^(roof|roof top|rooftop|roof level|terrace)$/.test(s))
    return { key: "ROOF", level: 100, name: "Roof" };

  const ordinalWord = s.match(
    /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)( floor| level)?$/,
  );
  if (ordinalWord) return named(ORDINALS[ordinalWord[1]!]!);

  const numeric =
    s.match(/^(\d{1,2})(st|nd|rd|th)?( floor| level| fl)?$/) ??
    s.match(/^(?:level|lvl|floor|fl|storey|story|etage|l|f)\s?(-?\d{1,2})$/);
  if (numeric) {
    const n = Number(numeric[1]);
    if (Number.isFinite(n)) return named(n);
  }
  return null;
}

function levelName(level: number): string {
  if (level === 0) return "Ground floor";
  if (level === -1) return "Basement";
  if (level < 0) return `Basement ${-level}`;
  const suffix =
    level % 10 === 1 && level !== 11
      ? "st"
      : level % 10 === 2 && level !== 12
        ? "nd"
        : level % 10 === 3 && level !== 13
          ? "rd"
          : "th";
  return `${level}${suffix} floor`;
}

/**
 * Splits a reader description "Level · Room — label" (src/lib/drawings.functions.ts)
 * into its parts. A line typed by hand without that shape is kept whole as the label.
 */
export function splitDescription(description: string): {
  level: string;
  room: string;
  label: string;
} {
  const dash = description.lastIndexOf(" — ");
  if (dash < 0) return { level: "", room: "", label: description.trim() };
  const where = description.slice(0, dash).trim();
  const label = description.slice(dash + 3).trim();
  const parts = where
    .split(" · ")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) return { level: parts[0]!, room: parts.slice(1).join(" · "), label };
  if (parts.length === 1) {
    return parseLevel(parts[0]!)
      ? { level: parts[0]!, room: "", label }
      : { level: "", room: parts[0]!, label };
  }
  return { level: "", room: "", label };
}

const UNIT_FAMILIES: Record<string, string> = {
  m2: "area",
  "m²": "area",
  sqm: "area",
  sqmt: "area",
  "sq m": "area",
  m3: "volume",
  "m³": "volume",
  cum: "volume",
  m: "length",
  lm: "length",
  rm: "length",
  ml: "length",
  no: "count",
  nr: "count",
  nos: "count",
  each: "count",
  ea: "count",
  pcs: "count",
  pc: "count",
  unit: "count",
  units: "count",
  set: "count",
  sets: "count",
};

export function unitFamily(unit: string): string {
  const u = unit.trim().toLowerCase().replace(/\.$/, "");
  return UNIT_FAMILIES[u] ?? u;
}

function boqMethod(method: string | null, unit: string): string {
  if (method === "length") return "linear";
  if (method && BOQ_METHODS.has(method)) return method;
  const family = unitFamily(unit);
  if (family === "area") return "area";
  if (family === "length") return "linear";
  if (family === "volume") return "volume";
  return "count";
}

/* ------------------------------------------------------------------ */
/* Catalog matching                                                    */
/* ------------------------------------------------------------------ */

/** Which catalog category slugs (or name words) a takeoff material category belongs to. */
const CATEGORY_FAMILIES: Record<string, string[]> = {
  floor: ["flooring", "floor", "tile"],
  skirting: ["flooring", "skirting"],
  door: ["doors", "door"],
  window: ["aluminium", "window", "glazing"],
  ceiling: ["ceilings", "ceiling", "gypsum"],
  wall: ["wall", "paint", "cladding"],
};

/** Words that pick one item out of a category with several unit-compatible items. */
const ITEM_HINTS: Record<string, string[]> = {
  skirting: ["skirting"],
  door: ["door"],
  window: ["window"],
  floor: ["floor", "tile"],
  wall: ["wall", "paint"],
  ceiling: ["ceiling", "gypsum"],
};

function findCategory(material: string | null, categories: CategoryInput[]): CategoryInput | null {
  if (!material) return null;
  const words = CATEGORY_FAMILIES[material.toLowerCase()] ?? [material.toLowerCase()];
  for (const w of words) {
    const bySlug = categories.find((c) => c.slug.toLowerCase() === w);
    if (bySlug) return bySlug;
  }
  for (const w of words) {
    const byName = categories.find((c) => c.name.toLowerCase().includes(w));
    if (byName) return byName;
  }
  return null;
}

export function matchCatalogItem(
  line: Pick<TakeoffInput, "material_category" | "unit" | "catalog_item_id">,
  items: CatalogItemInput[],
  categories: CategoryInput[],
): { itemId: string | null; categoryId: string | null } {
  const active = items.filter((i) => i.is_active);
  if (line.catalog_item_id && active.some((i) => i.id === line.catalog_item_id)) {
    const item = active.find((i) => i.id === line.catalog_item_id)!;
    return { itemId: item.id, categoryId: item.category_id };
  }
  const category = findCategory(line.material_category, categories);
  const family = unitFamily(line.unit);
  const hints = ITEM_HINTS[(line.material_category ?? "").toLowerCase()] ?? [];
  const nameHit = (i: CatalogItemInput) => hints.some((h) => i.name.toLowerCase().includes(h));

  const pool = active.filter(
    (i) => unitFamily(i.unit) === family && (category ? i.category_id === category.id : nameHit(i)),
  );
  if (pool.length === 1) return { itemId: pool[0]!.id, categoryId: pool[0]!.category_id };
  if (pool.length > 1 && category) {
    const narrowed = pool.filter(nameHit);
    if (narrowed.length === 1)
      return { itemId: narrowed[0]!.id, categoryId: narrowed[0]!.category_id };
  }
  return { itemId: null, categoryId: category?.id ?? null };
}

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

function quantityOf(line: TakeoffInput): number | null {
  const pick = line.human_quantity ?? line.ai_quantity;
  if (pick === null || pick === undefined || pick === "") return null;
  const n = Number(pick);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function planTakeoffToBoq(input: {
  takeoff: TakeoffInput[];
  alreadyInBoq: Set<string>;
  houses: HouseInput[];
  floors: FloorInput[];
  rooms: RoomInput[];
  items: CatalogItemInput[];
  categories: CategoryInput[];
  /** Restrict to these takeoff line ids (the QS's selection); all reviewed lines when omitted. */
  only?: Set<string>;
}): TakeoffPlan {
  const plan: TakeoffPlan = {
    newHouse: null,
    newFloors: [],
    newRooms: [],
    roomOptions: [],
    lines: [],
    skipped: [],
  };

  const house = [...input.houses].sort((a, b) => a.sort_order - b.sort_order)[0] ?? null;
  const houseRef = house ? `house:${house.id}` : "newhouse:main";
  if (!house) plan.newHouse = { key: "newhouse:main", name: "Main building" };

  const houseFloors = house ? input.floors.filter((f) => f.house_id === house.id) : [];
  const usedLevels = new Set(houseFloors.map((f) => f.level));

  // floorRef -> rooms on it (existing + new), keyed by normalised room name.
  const floorRefFor = new Map<string, string>(); // level key -> floorRef
  const roomRefFor = new Map<string, string>(); // `${floorRef}|${normName}` -> room key

  for (const f of houseFloors) {
    const parsed = parseLevel(f.name);
    const key = parsed?.key ?? `N:${normaliseName(f.name)}`;
    if (!floorRefFor.has(key)) floorRefFor.set(key, `floor:${f.id}`);
    if (!floorRefFor.has(`L${f.level}`) && !parsed) floorRefFor.set(`L${f.level}`, `floor:${f.id}`);
  }
  for (const r of input.rooms) {
    if (!houseFloors.some((f) => f.id === r.floor_id)) continue;
    roomRefFor.set(`floor:${r.floor_id}|${normaliseName(r.name)}`, `room:${r.id}`);
  }

  const floorLabel = new Map<string, string>();
  for (const f of houseFloors) floorLabel.set(`floor:${f.id}`, f.name);

  const resolveFloor = (levelLabel: string): string => {
    const parsed = parseLevel(levelLabel);
    if (!levelLabel.trim()) {
      if (houseFloors.length === 1) return `floor:${houseFloors[0]!.id}`;
      return resolveFloor("Ground floor");
    }
    const key = parsed?.key ?? `N:${normaliseName(levelLabel)}`;
    const existing = floorRefFor.get(key);
    if (existing) return existing;
    let level = parsed?.level;
    if (level === undefined) {
      level = Math.max(0, ...usedLevels, ...plan.newFloors.map((f) => f.level)) + 1;
    }
    usedLevels.add(level);
    const ref = `newfloor:${key}`;
    const name = parsed?.name ?? levelLabel.trim();
    plan.newFloors.push({ key: ref, name, level, houseRef });
    floorRefFor.set(key, ref);
    floorLabel.set(ref, name);
    return ref;
  };

  const newRoomByKey = new Map<string, NewRoom>();
  const resolveRoom = (floorRef: string, roomName: string): string => {
    const name = roomName.trim() || "General";
    const k = `${floorRef}|${normaliseName(name)}`;
    const existing = roomRefFor.get(k);
    if (existing) return existing;
    const ref = `newroom:${k}`;
    const room: NewRoom = {
      key: ref,
      name,
      floorRef,
      floor_area_m2: 0,
      wall_area_m2: 0,
      perimeter_m: 0,
    };
    plan.newRooms.push(room);
    newRoomByKey.set(ref, room);
    roomRefFor.set(k, ref);
    return ref;
  };

  for (const line of input.takeoff) {
    if (input.only && !input.only.has(line.id)) continue;
    const label = line.description;
    if (input.alreadyInBoq.has(line.id)) {
      plan.skipped.push({ takeoffLineId: line.id, label, reason: "already_in_boq" });
      continue;
    }
    if (line.status === "rejected") {
      plan.skipped.push({ takeoffLineId: line.id, label, reason: "rejected" });
      continue;
    }
    if (!REVIEWED.has(line.status)) {
      plan.skipped.push({ takeoffLineId: line.id, label, reason: "not_reviewed" });
      continue;
    }
    if ((line.material_category ?? "").toLowerCase() === "opening") {
      plan.skipped.push({ takeoffLineId: line.id, label, reason: "deduction" });
      continue;
    }
    const base = quantityOf(line);
    if (base === null) {
      plan.skipped.push({ takeoffLineId: line.id, label, reason: "no_quantity" });
      continue;
    }

    const parts = splitDescription(line.description);
    const floorRef = resolveFloor(parts.level);
    const roomKey = resolveRoom(floorRef, parts.room);

    // A room the plan creates carries the measured areas, so nobody retypes them either.
    const newRoom = newRoomByKey.get(roomKey);
    if (newRoom) {
      const cat = (line.material_category ?? "").toLowerCase();
      if (cat === "floor" && unitFamily(line.unit) === "area") newRoom.floor_area_m2 = base;
      if (cat === "wall" && unitFamily(line.unit) === "area") newRoom.wall_area_m2 = base;
      if (cat === "skirting" && unitFamily(line.unit) === "length") newRoom.perimeter_m = base;
    }

    const match = matchCatalogItem(line, input.items, input.categories);
    const item = match.itemId ? input.items.find((i) => i.id === match.itemId) : undefined;
    const wastagePct = item ? Number(item.default_wastage_pct ?? 0) || 0 : 0;

    plan.lines.push({
      takeoffLineId: line.id,
      label: parts.label || line.description,
      roomKey,
      catalogItemId: match.itemId,
      suggestedCategoryId: match.categoryId,
      needsCatalogItem: match.itemId === null,
      unit: line.unit,
      measurementMethod: boqMethod(line.measurement_method, line.unit),
      baseQuantity: base,
      wastagePct,
      quantity: withWastage(base, wastagePct),
      note: `From takeoff: ${line.description}${line.ai_source ? ` (${line.ai_source})` : ""}`,
    });
  }

  // Every room a line could be moved to: existing rooms in the house, then new ones.
  for (const f of houseFloors) {
    for (const r of input.rooms.filter((x) => x.floor_id === f.id)) {
      plan.roomOptions.push({
        key: `room:${r.id}`,
        label: `${f.name} · ${r.name}`,
        existing: true,
      });
    }
  }
  for (const r of plan.newRooms) {
    plan.roomOptions.push({
      key: r.key,
      label: `${floorLabel.get(r.floorRef) ?? "New floor"} · ${r.name} (new)`,
      existing: false,
    });
  }
  // Keep only new rooms some line actually lands in (a QS may move lines later; the
  // writer re-checks this against the final choice).
  return plan;
}

/** Applies the QS's per-line choice of item: recomputes wastage and billable quantity. */
export function withCatalogItem(line: PlannedLine, item: CatalogItemInput | null): PlannedLine {
  const wastagePct = item ? Number(item.default_wastage_pct ?? 0) || 0 : 0;
  return {
    ...line,
    catalogItemId: item?.id ?? null,
    needsCatalogItem: item === null,
    wastagePct,
    quantity: withWastage(line.baseQuantity, wastagePct),
  };
}
