/**
 * Product packages — how UZA splits a project into sourceable packages.
 *
 * A package is one finishing product family on one project (the aluminium
 * windows, the interior doors, the conference lighting). Sourcing happens per
 * package, not per project, because each package goes to a different factory
 * with a different lead time.
 *
 * The brief checklist below is Cecilia's sourcing checklist, written down so
 * that every project arrives at procurement in the same shape. Nothing here is
 * a money value — commercial constants live in src/config/policy.ts.
 */

export type PackageCategory = {
  key: string;
  label: string;
  group: string;
  /** What a factory must be told before it can quote this family sensibly. */
  sourcingNote: string;
};

export const PACKAGE_CATEGORIES: PackageCategory[] = [
  {
    key: "aluminium_windows_doors",
    label: "Aluminium windows & doors",
    group: "Openings",
    sourcingNote:
      "Profile system and series, glazing build-up, opening type, colour/finish, wind and water performance, confirmed opening sizes.",
  },
  {
    key: "interior_doors",
    label: "Interior doors",
    group: "Openings",
    sourcingNote:
      "Leaf construction, core, finish and colour, frame type, ironmongery, fire or acoustic rating, handing and confirmed sizes.",
  },
  {
    key: "tiles",
    label: "Tiles",
    group: "Surfaces",
    sourcingNote:
      "Format, colour and pattern, surface finish, slip rating, water absorption, PEI class, area per room and trims.",
  },
  {
    key: "carpets",
    label: "Carpets & soft flooring",
    group: "Surfaces",
    sourcingNote:
      "Construction, pile weight, backing, fire class, colourway or custom design, roll or tile format, area and wastage.",
  },
  {
    key: "acoustic_panels",
    label: "Panels — acoustic",
    group: "Surfaces",
    sourcingNote:
      "Target absorption class, substrate, perforation pattern, finish, fire class, fixing system, wall and ceiling areas.",
  },
  {
    key: "wall_panels",
    label: "Panels — non-acoustic",
    group: "Surfaces",
    sourcingNote: "Substrate, finish, colour and texture, thickness, fixing system, areas and edge detailing.",
  },
  {
    key: "lighting_conference",
    label: "Lighting — conference & commercial",
    group: "Lighting",
    sourcingNote:
      "Lux level per space, colour temperature, CRI, dimming/control protocol, mounting, IP rating, luminaire schedule.",
  },
  {
    key: "lighting_residential",
    label: "Lighting — residential",
    group: "Lighting",
    sourcingNote: "Style direction, colour temperature, mounting type, control method, quantities per room.",
  },
  {
    key: "lighting_solar_street",
    label: "Lighting — solar street & area",
    group: "Lighting",
    sourcingNote:
      "Pole height and spacing, lumen output, battery and panel sizing, autonomy nights, IP/IK rating, mounting and foundation.",
  },
  {
    key: "cabinetry",
    label: "Cabinetry & joinery",
    group: "Furniture",
    sourcingNote:
      "Carcass and door material, finish and colour, hardware brand, worktop, confirmed site dimensions and elevations.",
  },
  {
    key: "furniture",
    label: "Loose furniture",
    group: "Furniture",
    sourcingNote: "Typology and quantities, dimensions, frame and upholstery, colour, fire compliance where required.",
  },
  {
    key: "electronics",
    label: "Electronics & AV",
    group: "Equipment",
    sourcingNote: "Function and coverage, screen or speaker sizing, control system, power and data provision, warranty.",
  },
  {
    key: "kitchen_equipment",
    label: "Kitchen equipment",
    group: "Equipment",
    sourcingNote: "Covers per service, equipment schedule, power/gas/water provision, extraction, service and parts support.",
  },
  {
    key: "hotel_textiles",
    label: "Hotel textiles & bedding",
    group: "Hospitality",
    sourcingNote: "Sizes per bed type, composition and GSM, thread count, colourway, laundry cycles, par levels.",
  },
  {
    key: "sanitaryware",
    label: "Sanitaryware & ceramics",
    group: "Wet areas",
    sourcingNote: "Shape and style per fitting, flush and trap type, tapware finish, water pressure range, rough-in dimensions.",
  },
  { key: "other", label: "Other package", group: "Other", sourcingNote: "Describe the scope and the performance expected." },
];

export function categoryLabel(key: string): string {
  return PACKAGE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export function categoryNote(key: string): string {
  return PACKAGE_CATEGORIES.find((c) => c.key === key)?.sourcingNote ?? "";
}

/* ------------------------------------------------------------------ */
/* Quality tiers                                                       */
/* ------------------------------------------------------------------ */

export const QUALITY_TIERS = [
  {
    value: "premium",
    label: "Premium / high end",
    description: "Specification led. Brand-grade factories, long warranties, samples always approved before production.",
  },
  {
    value: "value",
    label: "Value for money",
    description: "The default. Recognised factories, honest specification, no cosmetic substitutions.",
  },
  {
    value: "economical",
    label: "Economical",
    description: "Cost led, but never below the UZA minimum standard below.",
  },
] as const;

export type QualityTier = (typeof QUALITY_TIERS)[number]["value"];

export function tierLabel(value: string): string {
  return QUALITY_TIERS.find((t) => t.value === value)?.label ?? value;
}

/**
 * The floor UZA does not go below, whatever the budget.
 * Written here so a package cannot be quietly downgraded in a chat.
 */
export const MINIMUM_STANDARD = [
  "The factory is audited or previously supplied by UZA, and issues a real proforma with its own registration.",
  "Specification on the quotation matches the specification on the BOQ line — no unnamed substitution.",
  "A physical sample or a production photo is approved before the production order is released.",
  "The stated warranty is written on the proforma, not promised verbally.",
  "Packing and marking are agreed for sea freight to Kigali before shipment.",
] as const;

/* ------------------------------------------------------------------ */
/* The brief checklist                                                 */
/* ------------------------------------------------------------------ */

export type RequirementOwner = "client" | "architect" | "qs" | "interior_designer" | "uza";

export const REQUIREMENT_OWNERS: Record<RequirementOwner, string> = {
  client: "Client",
  architect: "Architect",
  qs: "Quantity Surveyor",
  interior_designer: "Interior Designer",
  uza: "UZA (Cecilia / admin)",
};

export type PackageRequirement = {
  key: string;
  label: string;
  /** Plain sentence shown next to the field — why we are asking. */
  why: string;
  /** A document or picture must be attached, not just typed. */
  needsDocument: boolean;
  owner: RequirementOwner;
  /** Sourcing cannot responsibly start until this is provided. */
  blocksSourcing: boolean;
};

export const PACKAGE_REQUIREMENTS: PackageRequirement[] = [
  {
    key: "final_drawings",
    label: "Latest and final technical drawings for this package",
    why: "A factory quoting from a superseded drawing produces the wrong item at full price.",
    needsDocument: true,
    owner: "architect",
    blocksSourcing: true,
  },
  {
    key: "boq_reference",
    label: "BOQ extract with item references, dimensions and quantities",
    why: "The item number ties the quotation, the proforma and the site delivery to the same line.",
    needsDocument: true,
    owner: "qs",
    blocksSourcing: true,
  },
  {
    key: "technical_specs",
    label: "Technical specification, materials and performance standards",
    why: "Performance is what a factory prices. Without it every quotation is a different product.",
    needsDocument: false,
    owner: "architect",
    blocksSourcing: true,
  },
  {
    key: "design_appearance",
    label: "Appearance: style, colour, shape, pattern, texture, surface finish",
    why: "Quality level alone is not a design direction. This is what makes a recommendation possible.",
    needsDocument: false,
    owner: "interior_designer",
    blocksSourcing: true,
  },
  {
    key: "references_renderings",
    label: "Renderings, reference pictures or approved samples",
    why: "If the client has not chosen the exact product, a picture lets us propose options in the right direction.",
    needsDocument: true,
    owner: "client",
    blocksSourcing: true,
  },
  {
    key: "product_selections",
    label: "Product-specific selections where the client has already decided",
    why: "Tile colour and pattern, toilet style, door design, sanitaryware shape, lighting style.",
    needsDocument: false,
    owner: "client",
    blocksSourcing: false,
  },
  {
    key: "quality_level",
    label: "Expected quality level",
    why: "Premium, value for money or economical — it decides which factories are approached at all.",
    needsDocument: false,
    owner: "client",
    blocksSourcing: true,
  },
  {
    key: "target_budget",
    label: "Target budget range for this package",
    why: "A range is enough. It stops us presenting options the client was never going to buy.",
    needsDocument: false,
    owner: "client",
    blocksSourcing: false,
  },
  {
    key: "delivery_date",
    label: "Required delivery date on site",
    why: "Production plus sea freight to Kigali is worked backwards from this date.",
    needsDocument: false,
    owner: "client",
    blocksSourcing: true,
  },
  {
    key: "priority",
    label: "Priority against the other packages and projects",
    why: "When two projects need the same factory slot, priority decides which one takes it.",
    needsDocument: false,
    owner: "uza",
    blocksSourcing: false,
  },
];

export const REQUIREMENT_STATUSES = [
  { value: "missing", label: "Not provided" },
  { value: "requested", label: "Requested from owner" },
  { value: "provided", label: "Provided" },
  { value: "not_applicable", label: "Not applicable" },
] as const;

export const PACKAGE_STATUSES = [
  { value: "collecting", label: "Collecting the brief" },
  { value: "ready_to_source", label: "Ready to source" },
  { value: "sourcing", label: "Out to factories" },
  { value: "quoted", label: "Quotations received" },
  { value: "ordered", label: "Ordered" },
  { value: "closed", label: "Closed" },
] as const;

export function packageStatusLabel(value: string): string {
  return PACKAGE_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export const ATTACHMENT_KINDS = [
  { value: "drawing", label: "Technical drawing" },
  { value: "boq", label: "BOQ extract" },
  { value: "specification", label: "Specification" },
  { value: "rendering", label: "Rendering" },
  { value: "reference_image", label: "Reference picture" },
  { value: "sample_photo", label: "Approved sample photo" },
  { value: "other", label: "Other document" },
] as const;

export const MANUFACTURER_STATUSES = [
  { value: "shortlisted", label: "Shortlisted" },
  { value: "rfq_sent", label: "RFQ sent" },
  { value: "quoted", label: "Quoted" },
  { value: "selected", label: "Selected" },
  { value: "rejected", label: "Not retained" },
] as const;
