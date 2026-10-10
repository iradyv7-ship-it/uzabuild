import { describe, expect, it } from "vitest";
import {
  matchCatalogItem,
  parseLevel,
  planTakeoffToBoq,
  splitDescription,
  unitFamily,
  withCatalogItem,
  type CatalogItemInput,
  type CategoryInput,
  type TakeoffInput,
} from "@/lib/takeoff-to-boq";

const categories: CategoryInput[] = [
  { id: "cat-floor", name: "Flooring", slug: "flooring" },
  { id: "cat-doors", name: "Interior Doors", slug: "doors" },
  { id: "cat-alu", name: "Aluminium Windows & Doors", slug: "aluminium" },
];

const items: CatalogItemInput[] = [
  {
    id: "tile",
    category_id: "cat-floor",
    name: "Porcelain tile 60x60",
    unit: "m2",
    default_wastage_pct: 10,
    is_active: true,
  },
  {
    id: "skirt",
    category_id: "cat-floor",
    name: "Tile skirting 10cm",
    unit: "m",
    default_wastage_pct: 5,
    is_active: true,
  },
  {
    id: "door",
    category_id: "cat-doors",
    name: "Flush door 900",
    unit: "no",
    default_wastage_pct: 0,
    is_active: true,
  },
  {
    id: "door2",
    category_id: "cat-doors",
    name: "Solid oak door",
    unit: "no",
    default_wastage_pct: 0,
    is_active: true,
  },
  {
    id: "old",
    category_id: "cat-alu",
    name: "Old window",
    unit: "no",
    default_wastage_pct: 0,
    is_active: false,
  },
];

function line(over: Partial<TakeoffInput>): TakeoffInput {
  return {
    id: "t1",
    description: "Ground floor · Bedroom 1 — floor area",
    unit: "m2",
    measurement_method: "area",
    material_category: "floor",
    ai_quantity: 12,
    human_quantity: null,
    status: "accepted",
    catalog_item_id: null,
    ai_source: "Read by Claude from plan.pdf",
    ...over,
  };
}

const empty = {
  houses: [],
  floors: [],
  rooms: [],
  items,
  categories,
  alreadyInBoq: new Set<string>(),
};

describe("parseLevel", () => {
  it.each([
    ["Ground floor", 0],
    ["GF", 0],
    ["G/F", 0],
    ["Level 0", 0],
    ["RDC", 0],
    ["First floor", 1],
    ["1st floor", 1],
    ["L2", 2],
    ["Level 3", 3],
    ["Basement", -1],
    ["B1", -1],
  ])("%s -> level %i", (label, level) => {
    expect(parseLevel(label)?.level).toBe(level);
  });

  it("puts ground floor variants under one key", () => {
    expect(parseLevel("GF")?.key).toBe(parseLevel("Level 0")?.key);
  });

  it("recognises the roof and rejects room names", () => {
    expect(parseLevel("Roof")?.key).toBe("ROOF");
    expect(parseLevel("Kitchen")).toBeNull();
    expect(parseLevel("")).toBeNull();
  });
});

describe("splitDescription", () => {
  it("splits the reader's 'level · room — label' shape", () => {
    expect(splitDescription("Ground floor · Bedroom 1 — floor area")).toEqual({
      level: "Ground floor",
      room: "Bedroom 1",
      label: "floor area",
    });
  });
  it("tells a lone level from a lone room", () => {
    expect(splitDescription("First floor — doors").level).toBe("First floor");
    expect(splitDescription("Kitchen — doors").room).toBe("Kitchen");
  });
  it("keeps a hand-typed description whole", () => {
    expect(splitDescription("Screed to all floors")).toEqual({
      level: "",
      room: "",
      label: "Screed to all floors",
    });
  });
});

describe("unitFamily", () => {
  it("treats m2/m²/sqm alike and no/nr/pcs alike", () => {
    expect(unitFamily("m²")).toBe(unitFamily("sqm"));
    expect(unitFamily("nr")).toBe(unitFamily("pcs"));
    expect(unitFamily("m")).not.toBe(unitFamily("m2"));
  });
});

describe("matchCatalogItem", () => {
  it("attaches the one item that fits category and unit", () => {
    expect(matchCatalogItem(line({}), items, categories).itemId).toBe("tile");
    expect(
      matchCatalogItem(line({ material_category: "skirting", unit: "m" }), items, categories)
        .itemId,
    ).toBe("skirt");
  });
  it("leaves it empty when two items fit, but suggests the category", () => {
    const m = matchCatalogItem(line({ material_category: "door", unit: "no" }), items, categories);
    expect(m.itemId).toBeNull();
    expect(m.categoryId).toBe("cat-doors");
  });
  it("never picks an inactive item", () => {
    expect(
      matchCatalogItem(line({ material_category: "window", unit: "no" }), items, categories).itemId,
    ).toBeNull();
  });
  it("keeps an item the takeoff line already carries", () => {
    expect(
      matchCatalogItem(
        line({ catalog_item_id: "door2", material_category: "door" }),
        items,
        categories,
      ).itemId,
    ).toBe("door2");
  });
});

describe("planTakeoffToBoq", () => {
  it("sends only reviewed lines, preferring the human quantity", () => {
    const plan = planTakeoffToBoq({
      ...empty,
      takeoff: [
        line({ id: "a", human_quantity: 14 }),
        line({ id: "b", status: "draft" }),
        line({ id: "c", status: "rejected" }),
        line({
          id: "d",
          status: "corrected",
          human_quantity: 3,
          material_category: "skirting",
          unit: "m",
          measurement_method: "length",
          description: "Ground floor · Bedroom 1 — perimeter",
        }),
      ],
    });
    expect(plan.lines.map((l) => l.takeoffLineId)).toEqual(["a", "d"]);
    expect(plan.lines[0]!.baseQuantity).toBe(14);
    expect(plan.lines[0]!.quantity).toBeCloseTo(15.4); // 10% tile wastage
    expect(plan.lines[1]!.measurementMethod).toBe("linear");
    expect(plan.skipped.map((s) => s.reason).sort()).toEqual(["not_reviewed", "rejected"]);
  });

  it("is idempotent: lines already in the BOQ are skipped", () => {
    const plan = planTakeoffToBoq({ ...empty, alreadyInBoq: new Set(["t1"]), takeoff: [line({})] });
    expect(plan.lines).toHaveLength(0);
    expect(plan.skipped[0]!.reason).toBe("already_in_boq");
  });

  it("skips the opening deduction", () => {
    const plan = planTakeoffToBoq({ ...empty, takeoff: [line({ material_category: "opening" })] });
    expect(plan.skipped[0]!.reason).toBe("deduction");
  });

  it("creates one building, one floor per level and one room per name, carrying the measured areas", () => {
    const plan = planTakeoffToBoq({
      ...empty,
      takeoff: [
        line({ id: "a", description: "GF · Bedroom 1 — floor area", ai_quantity: 12 }),
        line({
          id: "b",
          description: "Ground floor · bedroom-1 — wall area (net of openings)",
          material_category: "wall",
          ai_quantity: 30,
        }),
        line({ id: "c", description: "First floor · Study — floor area", ai_quantity: 9 }),
      ],
    });
    expect(plan.newHouse?.name).toBe("Main building");
    expect(plan.newFloors.map((f) => [f.name, f.level])).toEqual([
      ["Ground floor", 0],
      ["1st floor", 1],
    ]);
    expect(plan.newRooms.map((r) => r.name)).toEqual(["Bedroom 1", "Study"]);
    expect(plan.newRooms[0]).toMatchObject({ floor_area_m2: 12, wall_area_m2: 30 });
    expect(plan.lines[0]!.roomKey).toBe(plan.lines[1]!.roomKey);
    expect(plan.lines[1]!.needsCatalogItem).toBe(true); // no wall category in the catalog
  });

  it("reuses existing rooms and floors, matching level spellings and room names loosely", () => {
    const plan = planTakeoffToBoq({
      ...empty,
      houses: [{ id: "h1", name: "Villa", sort_order: 0 }],
      floors: [{ id: "f0", house_id: "h1", name: "Level 0", level: 0 }],
      rooms: [{ id: "r1", floor_id: "f0", name: "Bedroom 1" }],
      takeoff: [line({ description: "GF · BEDROOM 1 — floor area" })],
    });
    expect(plan.newHouse).toBeNull();
    expect(plan.newFloors).toHaveLength(0);
    expect(plan.newRooms).toHaveLength(0);
    expect(plan.lines[0]!.roomKey).toBe("room:r1");
    expect(plan.roomOptions.map((o) => o.key)).toContain("room:r1");
  });

  it("puts lines with no level on the only floor there is", () => {
    const plan = planTakeoffToBoq({
      ...empty,
      houses: [{ id: "h1", name: "Villa", sort_order: 0 }],
      floors: [{ id: "f9", house_id: "h1", name: "Main", level: 0 }],
      rooms: [],
      takeoff: [line({ description: "Kitchen — floor area" })],
    });
    expect(plan.newFloors).toHaveLength(0);
    expect(plan.newRooms[0]).toMatchObject({ name: "Kitchen", floorRef: "floor:f9" });
  });

  it("respects the QS's selection", () => {
    const plan = planTakeoffToBoq({
      ...empty,
      only: new Set(["b"]),
      takeoff: [line({ id: "a" }), line({ id: "b" })],
    });
    expect(plan.lines.map((l) => l.takeoffLineId)).toEqual(["b"]);
  });
});

describe("withCatalogItem", () => {
  it("recomputes wastage when the QS picks another item", () => {
    const plan = planTakeoffToBoq({ ...empty, takeoff: [line({ ai_quantity: 10 })] });
    const changed = withCatalogItem(
      plan.lines[0]!,
      items.find((i) => i.id === "skirt")!,
    );
    expect(changed.wastagePct).toBe(5);
    expect(changed.quantity).toBeCloseTo(10.5);
    expect(withCatalogItem(plan.lines[0]!, null).needsCatalogItem).toBe(true);
  });
});
