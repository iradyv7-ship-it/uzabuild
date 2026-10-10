import { describe, expect, it } from "vitest";
import {
  SCHEDULE_TOKEN,
  buildRfq,
  insertSchedule,
  maskSensitive,
  renderSchedule,
  scheduleFor,
  type RfqBoqLine,
  type RfqPackage,
} from "@/lib/rfq";

const pkg: RfqPackage = {
  package_code: "PKG-0007-TIL",
  category: "tiles",
  title: "Floor and wall tiles — Nyarutarama Heights",
  scope_note: "All wet areas for Acme Developers Ltd.",
  quality_tier: "value",
  priority: 1,
  phase: 1,
  required_delivery_date: "2026-12-15",
  style_note: "Warm minimal",
  colour_note: "Sand beige",
  shape_note: "600x1200",
  pattern_note: null,
  texture_note: null,
  finish_note: "Matt R10",
  performance_note: null,
};

const line = (over: Partial<RfqBoqLine>): RfqBoqLine => ({
  description: "Porcelain floor tile 600x1200 matt",
  unit: "m2",
  quantity: 10,
  catalogSlug: "flooring",
  catalogItemName: "Porcelain 60x120",
  locationLabel: "Bathroom 1",
  multiplier: 1,
  ...over,
});

const names = {
  clientName: "Acme Developers Ltd",
  clientContact: "Jean Mugabo",
  projectName: "Nyarutarama Heights",
  projectLocation: "Nyarutarama",
  otherManufacturers: ["Foshan Rival Ceramics"],
};

describe("scheduleFor", () => {
  it("keeps only the package's lines and merges repeats across rooms and houses", () => {
    const rows = scheduleFor("tiles", [
      line({}),
      line({ locationLabel: "Bathroom 2", quantity: 5, multiplier: 3 }),
      line({ description: "Wool carpet", catalogItemName: "Carpet", quantity: 40 }),
      line({
        description: "LED downlight",
        catalogSlug: "lighting",
        catalogItemName: "Downlight",
        unit: "no",
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ item: "01", quantity: 25, location: "Bathroom 1; Bathroom 2" });
  });

  it("splits flooring between tiles and carpets by keyword", () => {
    const lines = [line({}), line({ description: "Carpet tile 50x50", catalogItemName: "Carpet" })];
    expect(scheduleFor("carpets", lines).map((r) => r.description)).toEqual(["Carpet tile 50x50"]);
  });
});

describe("buildRfq", () => {
  const draft = buildRfq({
    pkg,
    requirements: [{ requirement_key: "final_drawings", status: "provided" }],
    attachments: [
      { kind: "drawing", mime_type: "application/pdf" },
      { kind: "drawing", mime_type: "application/pdf" },
    ],
    boqLines: [line({})],
    names,
    salutation: "Foshan Good Tiles Co.",
  });

  it("never carries the client, project, site or a rival factory", () => {
    const all = `${draft.subject}\n${draft.body}\n${JSON.stringify(draft.schedule)}`;
    for (const n of ["Acme", "Nyarutarama", "Jean Mugabo", "Foshan Rival"])
      expect(all).not.toContain(n);
    expect(draft.warnings.join(" ")).toMatch(/Removed names/);
  });

  it("carries no money at all", () => {
    expect(draft.body).not.toMatch(/RWF|USD\s*\d|budget/i);
  });

  it("addresses the chosen manufacturer and keeps the schedule token for the polish step", () => {
    expect(draft.body).toContain("Dear Foshan Good Tiles Co.,");
    expect(draft.body).toContain(SCHEDULE_TOKEN);
    expect(draft.body).toContain("PKG-0007-TIL");
    expect(draft.body).toMatch(/slip rating/i);
  });

  it("lists attachments by kind, never by file name", () => {
    expect(draft.body).toContain("2 × drawing");
  });

  it("warns about blocking checklist items still missing", () => {
    expect(draft.warnings.some((w) => w.includes("BOQ extract"))).toBe(true);
    expect(draft.warnings.some((w) => w.includes("Latest and final technical drawings"))).toBe(
      false,
    );
  });

  it("warns when no BOQ line matches", () => {
    const empty = buildRfq({ pkg, requirements: [], attachments: [], boqLines: [], names: {} });
    expect(empty.schedule).toHaveLength(0);
    expect(empty.warnings[0]).toMatch(/No BOQ line matches/);
  });
});

describe("schedule rendering", () => {
  const rows = [
    { item: "01", description: "Porcelain tile", unit: "m2", quantity: 12.5, location: null },
  ];
  it("renders English and Chinese tables with the same quantities", () => {
    expect(renderSchedule(rows, "en")).toContain("01 | Porcelain tile | m2 | 12.50");
    expect(renderSchedule(rows, "zh", ["瓷砖"])).toContain(
      "01 | 瓷砖 (Porcelain tile) | m2 | 12.50",
    );
  });
  it("puts the schedule back at the token, or appends it if the token was lost", () => {
    expect(insertSchedule(`a\n${SCHEDULE_TOKEN}\nb`, "T")).toEqual({
      text: "a\nT\nb",
      tokenFound: true,
    });
    expect(insertSchedule("a", "T")).toEqual({ text: "a\n\nT", tokenFound: false });
  });
});

describe("maskSensitive", () => {
  it("is case-insensitive and reports what it removed", () => {
    expect(maskSensitive("for ACME DEVELOPERS LTD", names)).toEqual({
      text: "for the client",
      masked: ["Acme Developers Ltd"],
    });
  });
});
