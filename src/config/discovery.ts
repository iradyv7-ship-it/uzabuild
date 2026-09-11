/**
 * Guided client engagement — the script UZA uses in front of a client.
 *
 * This is deliberately a fixed, professional questionnaire: two people meeting
 * the same client must come back with the same understanding. Every question
 * carries the reason we ask it, so the conversation stays advisory and never
 * drifts into a casual chat.
 *
 * Confidence and CONFIRMED/ASSUMED tagging live on the stored answer, not here.
 */

export type DiscoveryQuestion = {
  key: string;
  question: string;
  /** Why we ask, and what a good answer looks like. Shown to the person in the room. */
  guidance: string;
  /** Procurement cannot responsibly start until this is answered. */
  blocksProcurement?: boolean;
  /** false = internal judgement note, never shown to the client. */
  clientVisible?: boolean;
};

export type DiscoverySection = {
  key: string;
  title: string;
  intent: string;
  questions: DiscoveryQuestion[];
};

export const DISCOVERY_SECTIONS: DiscoverySection[] = [
  {
    key: "client_and_authority",
    title: "1. Client, authority and decision path",
    intent: "Establish who decides, who signs and who pays before any pricing work begins.",
    questions: [
      {
        key: "decision_maker",
        question: "Who gives final approval on scope, material level and payment?",
        guidance: "Name, role and contact. If approval sits with a board or an owner abroad, record the review interval.",
        blocksProcurement: true,
      },
      {
        key: "client_team",
        question: "Which consultants sit on the client's side (architect, engineer, project manager)?",
        guidance: "We invite them into the project so clarifications are written, attributable and attached to documents.",
      },
      {
        key: "contracting_entity",
        question: "Which legal entity will be invoiced, and under what registration and TIN?",
        guidance: "This becomes the client identity record every proforma header is drawn from.",
        blocksProcurement: true,
      },
    ],
  },
  {
    key: "scope_and_quantum",
    title: "2. Scope and quantum",
    intent: "Fix the countable size of the job. Ambiguity here is what makes procurement re-quote.",
    questions: [
      {
        key: "unit_count",
        question: "Confirmed number of rooms / units / floors in this phase.",
        guidance: "A hotel priced at 118 keys and built at 132 is a different project. Ask for the signed schedule of accommodation.",
        blocksProcurement: true,
      },
      {
        key: "phase_scope",
        question: "What exactly falls inside the first purchasing phase?",
        guidance: "Separate stock items we can source immediately from items that need confirmed dimensions.",
        blocksProcurement: true,
      },
      {
        key: "excluded_scope",
        question: "What is explicitly excluded or handled by another contractor?",
        guidance: "Write the exclusions down now; they are the most common source of dispute at handover.",
      },
      {
        key: "areas_by_space",
        question: "Are floor areas, wall areas and ceiling heights available per room type?",
        guidance: "If not available, the space must go to human takeoff and the client must accept a survey visit.",
      },
    ],
  },
  {
    key: "material_level",
    title: "3. Material level and specification",
    intent: "Agree the standard being bought, not the brand names.",
    questions: [
      {
        key: "material_grade",
        question: "What material level is expected — economy, mid, high or bespoke luxury?",
        guidance: "Anchor with reference projects the client has seen. Record the level per area if it differs.",
        blocksProcurement: true,
      },
      {
        key: "custom_items",
        question: "Which items are customised (furniture, joinery, doors, stone)?",
        guidance: "Customised items need confirmed dimensions and detailed drawings before any factory quotation is meaningful.",
        blocksProcurement: true,
      },
      {
        key: "samples",
        question: "Who approves samples, and where must samples be presented?",
        guidance: "No production order is placed before sample approval. Confirm the approval location and lead time cost of it.",
        blocksProcurement: true,
      },
      {
        key: "design_intent",
        question: "What is the design intent, theme and any brand standard to respect?",
        guidance: "Hotel operators often impose a brand standard that overrides the designer. Ask for the document.",
      },
    ],
  },
  {
    key: "commercial",
    title: "4. Budget, payment and delivery",
    intent: "Test whether the ambition and the budget are the same project.",
    questions: [
      {
        key: "budget_band",
        question: "What budget band is approved, and is it per phase or total?",
        guidance: "A band is enough. Never leave the meeting with 'we will see' — record it as an assumption instead.",
        blocksProcurement: true,
      },
      {
        key: "payment_terms",
        question: "What payment structure is the client working to?",
        guidance: "Deposit, production milestone, shipment and site delivery. Factory production does not start on promises.",
        blocksProcurement: true,
      },
      {
        key: "delivery_schedule",
        question: "What is the required on-site delivery date, and what drives it?",
        guidance: "An opening date, a loan condition or a tenant handover. This sets the sea-freight cut-off we work back from.",
        blocksProcurement: true,
      },
      {
        key: "site_readiness",
        question: "When will the site be ready to receive, store and install?",
        guidance: "Early delivery to an unready site becomes our storage problem and our damage risk.",
      },
    ],
  },
  {
    key: "risk",
    title: "5. Risk and internal read",
    intent: "Our own judgement on the client. Internal only.",
    questions: [
      {
        key: "internal_read",
        question: "Internal read: how solid is this client and this scope?",
        guidance: "Honest assessment of funding, decisiveness and change risk. Never shown to the client.",
        clientVisible: false,
      },
      {
        key: "open_risks",
        question: "Internal: what could force a re-quote after we commit?",
        guidance: "Unconfirmed dimensions, unresolved brand standard, FX exposure, port and clearance timing.",
        clientVisible: false,
      },
    ],
  },
];

/** The coordination protocol UZA runs on every heavy project, in order. */
export const ENGAGEMENT_PROTOCOL = [
  {
    step: 1,
    owner: "Client lead",
    title: "Confirm priorities, budget range and delivery schedule",
    detail: "The client lead closes out the blocking questions above and records the answers here before procurement moves.",
  },
  {
    step: 2,
    owner: "Procurement lead",
    title: "Prepare procurement scope, missing-information list and sourcing priorities",
    detail: "Split the scope into what can be priced today and what waits on confirmed dimensions and detailed drawings.",
  },
  {
    step: 3,
    owner: "Procurement lead",
    title: "Obtain comparable quotations once scope and specification are confirmed",
    detail: "Comparable means same specification, same quantity, same incoterm. Quotations enter the platform, never a private chat.",
  },
  {
    step: 4,
    owner: "Client lead + Procurement lead",
    title: "Approve samples before any production order",
    detail: "Sample approval is recorded against the item. No production order is released without it.",
  },
] as const;

/** How we show up. Not decoration — it is the difference between a supplier and an advisor. */
export const ENGAGEMENT_STANDARD = [
  "Branded UZA workwear on every site visit and client meeting. No exceptions, including short visits.",
  "Site gear where the site requires it: helmet, hi-vis, safety boots, gloves, eye protection.",
  "One agenda circulated before the meeting, one written record after it, filed against the project.",
  "Advisory tone throughout. We are engaged to make the project execute correctly, not to sell materials.",
  "Nothing is confirmed verbally. If it is not recorded against the project, it did not happen.",
  "Commercial terms and proformas are issued by UZA only, never by a factory directly.",
] as const;

/**
 * Fallback conversion for factory RMB quotations.
 * The live rate now comes from a published feed (see src/lib/fx.functions.ts);
 * this constant is only used when that feed cannot be reached.
 */
export { FX_FALLBACK_RMB_PER_USD as RMB_PER_USD } from "@/config/policy";
