import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PACKAGE_REQUIREMENTS,
  MINIMUM_STANDARD,
  categoryLabel,
  packageStatusLabel,
} from "@/config/packages";

/**
 * Three role-specific assistants, not one generic chatbot — each reads real
 * project data through the caller's own (RLS-scoped) Supabase client and
 * refuses politely when there isn't enough of it to answer from. None of
 * them invent a BOQ quantity, a factory price or a package status: every
 * number in the prompt sent to the model came out of a real row.
 *
 * Picked these three (of the roles this branch also adds china_sourcing
 * to) because each already has a concrete, structured slice of domain data
 * to reason over without inventing new tables:
 *  - QS: boq_lines + catalog_categories already exist and are exactly what
 *    a quantity surveyor works from all day.
 *  - China Sourcing: this is the seat this branch adds (Cecilia's), and
 *    parseFactoryQuote() in proforma.functions.ts already exists to feed it
 *    — pairing an assistant with the role that owns that tool was the point
 *    of adding the role at all.
 *  - Procurement: product_packages/package_requirements/package_manufacturers
 *    (Cecilia's own sourcing checklist config, src/config/packages.ts) and
 *    purchase_orders are exactly "packages/procurement state," verbatim
 *    from the brief.
 * architect/interior_designer/mep_engineer/project_manager/client would each
 * need either richer existing data models than boq_lines/drawings already
 * give them, or (client) must stay cost-blind — good next candidates, not
 * first ones.
 */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
/** Opus 5. Conversational, grounded answers — no extended thinking needed. */
const MODEL = "claude-opus-5";
const MAX_TOKENS = 2048;

async function askClaude(system: string, question: string): Promise<string> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("This assistant is not configured.");

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: question }],
    }),
  });

  if (response.status === 429)
    throw new Error("This assistant is busy right now — try again in a moment.");
  if (response.status === 402) throw new Error("AI credits are exhausted.");
  if (!response.ok) throw new Error("The assistant could not answer that.");

  const json = (await response.json()) as { content?: { type: string; text?: string }[] };
  const answer = json.content?.find((b) => b.type === "text")?.text?.trim();
  if (!answer) throw new Error("The assistant returned nothing.");
  return answer;
}

function requireQuestion(value: unknown, label = "Ask a question first."): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(label);
  return value.trim().slice(0, 4000);
}

function requireProjectId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Select a project first.");
  return value;
}

/* ------------------------------------------------------------------ */
/* QS assistant                                                        */
/* ------------------------------------------------------------------ */

function validateQsAssistant(input: unknown): { projectId: string; question: string } {
  const v = input as Partial<{ projectId: string; question: string }>;
  return { projectId: requireProjectId(v?.projectId), question: requireQuestion(v?.question) };
}

/**
 * Answers a quantity surveyor's question about a project's actual BOQ:
 * quantities, measurement method, pricing, wastage — or flags disciplines
 * (catalog categories) with real work elsewhere in the platform but nothing
 * on this BOQ yet, a cheap first signal for a likely omission. Reads
 * boq_lines and catalog_categories for the caller's own project; never
 * invents a quantity or a rate that is not already in the database.
 */
export const qsAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateQsAssistant)
  .handler(async ({ data, context }) => {
    const { data: project, error: projectError } = await context.supabase
      .from("projects")
      .select("id, name, currency")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found, or you cannot access it.");

    const { data: lines, error: linesError } = await context.supabase
      .from("boq_lines")
      .select(
        "description, unit, measurement_method, measurement_note, base_quantity, wastage_pct, quantity, unit_rate_minor, amount_minor, currency, catalog_item_id, catalog_items(name, category_id, catalog_categories(name))",
      )
      .eq("project_id", data.projectId)
      .order("sort_order", { ascending: true })
      .limit(400);
    if (linesError) throw new Error(linesError.message);

    if (!lines || lines.length === 0) {
      return {
        answer:
          "There is no BOQ on this project yet — nothing for me to check quantities or pricing against. " +
          "Run a takeoff or add BOQ lines first, then ask me again.",
        linesConsidered: 0,
      };
    }

    const { data: categories } = await context.supabase
      .from("catalog_categories")
      .select("name")
      .order("sort_order", { ascending: true });

    type CatalogRow = {
      name: string | null;
      category_id: string | null;
      catalog_categories: { name: string | null } | null;
    };
    const usedCategories = new Set(
      lines
        .map((l) => {
          const item = l.catalog_items as unknown as CatalogRow | CatalogRow[] | null;
          const row = Array.isArray(item) ? item[0] : item;
          return row?.catalog_categories?.name ?? null;
        })
        .filter((n): n is string => !!n),
    );
    const missingCategories = (categories ?? [])
      .map((c) => c.name)
      .filter((name) => !usedCategories.has(name));

    const digest = lines
      .slice(0, 250)
      .map((l) => {
        const item = l.catalog_items as unknown as CatalogRow | CatalogRow[] | null;
        const row = Array.isArray(item) ? item[0] : item;
        const category = row?.catalog_categories?.name;
        return (
          `- ${l.description} | ${category ? `[${category}] ` : ""}unit=${l.unit} method=${l.measurement_method} ` +
          `base_qty=${l.base_quantity} wastage=${l.wastage_pct}% qty=${l.quantity} ` +
          `rate_minor=${l.unit_rate_minor} amount_minor=${l.amount_minor} ${l.currency}` +
          (l.measurement_note ? ` note="${l.measurement_note}"` : "")
        );
      })
      .join("\n");

    const system =
      "You are the quantity surveyor's assistant inside UZA Build, a construction take-off/BOQ/procurement " +
      "platform. You answer questions about a real project's BOQ (bill of quantities): line quantities, unit " +
      "of measurement (m2/m3/m/no/pcs), measurement method (count/area/length/volume), wastage percentage, " +
      "pinned vs catalog unit rate, and line amounts. Money figures below are integer minor units (cents), " +
      "never floats — quote them the way a QS would (e.g. 125000 minor units in RWF is RWF 1,250). " +
      "Every figure below came from the project's real boq_lines table. Never invent a quantity, rate or " +
      "measurement method that is not shown to you. If asked about something the data does not cover, say so " +
      "plainly rather than estimating. When asked to flag likely omissions, use the 'catalog categories with no " +
      "BOQ line yet' list below as your first signal, but say clearly that a missing category is a prompt to " +
      "check with the QS, not a confirmed omission — a category can legitimately be out of scope for a project.\n\n" +
      `Project: ${project.name} (currency ${project.currency}).\n` +
      `Catalog categories with no BOQ line yet: ${missingCategories.length ? missingCategories.join(", ") : "none — every catalog category has at least one BOQ line"}.\n\n` +
      `BOQ lines (${lines.length} total, showing up to 250):\n${digest}`;

    const answer = await askClaude(system, data.question);
    return { answer, linesConsidered: lines.length, missingCategories };
  });

/* ------------------------------------------------------------------ */
/* China sourcing assistant (Cecilia's)                                 */
/* ------------------------------------------------------------------ */

function validateSourcingAssistant(input: unknown): {
  projectId: string;
  task: "draft_reply" | "compare_quotes" | "question";
  question: string;
} {
  const v = input as Partial<{ projectId: string; task: string; question: string }>;
  const task = v?.task === "draft_reply" || v?.task === "compare_quotes" ? v.task : "question";
  const label =
    task === "draft_reply"
      ? "Paste the factory's message or describe what you want to say first."
      : task === "compare_quotes"
        ? "Ask what you want compared across the quotations."
        : "Ask your sourcing question first.";
  return {
    projectId: requireProjectId(v?.projectId),
    task,
    question: requireQuestion(v?.question, label),
  };
}

/**
 * Cecilia's assistant: given a project's real, already-issued proformas
 * (produced from parseFactoryQuote() drafts once confirmed), helps compare
 * quotations or draft a reply to a Chinese manufacturer. Reads proformas +
 * proforma_lines for the caller's own project; refuses when there is
 * nothing yet to compare or reply about.
 */
export const chinaSourcingAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateSourcingAssistant)
  .handler(async ({ data, context }) => {
    const { data: project, error: projectError } = await context.supabase
      .from("projects")
      .select("id, name")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found, or you cannot access it.");

    const { data: proformas, error: proformasError } = await context.supabase
      .from("proformas")
      .select(
        "id, reference, title, status, incoterm, payment_terms, lead_time_note, fx_rmb_per_usd, validity_days",
      )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (proformasError) throw new Error(proformasError.message);

    if (!proformas || proformas.length === 0) {
      return {
        answer:
          "There are no proformas on this project yet — nothing for me to compare or reply about. " +
          "Parse a factory quotation into a proforma first, then ask me again.",
        proformasConsidered: 0,
      };
    }
    if (data.task === "compare_quotes" && proformas.length < 2) {
      return {
        answer: `There is only one proforma on this project so far (${proformas[0]?.reference ?? "untitled"}) — nothing to compare it against yet.`,
        proformasConsidered: 1,
      };
    }

    const { data: lines, error: linesError } = await context.supabase
      .from("proforma_lines")
      .select("proforma_id, description, specification, unit, quantity, unit_price_usd_minor")
      .in(
        "proforma_id",
        proformas.map((p) => p.id),
      )
      .order("sort_order", { ascending: true })
      .limit(400);
    if (linesError) throw new Error(linesError.message);

    const linesByProforma = new Map<string, typeof lines>();
    for (const line of lines ?? []) {
      const bucket = linesByProforma.get(line.proforma_id) ?? [];
      bucket.push(line);
      linesByProforma.set(line.proforma_id, bucket);
    }

    const digest = proformas
      .map((p) => {
        const plines = linesByProforma.get(p.id) ?? [];
        const lineText = plines
          .slice(0, 40)
          .map(
            (l) =>
              `    - ${l.description}${l.specification ? ` (${l.specification})` : ""} | ${l.quantity} ${l.unit} @ ${l.unit_price_usd_minor} USD-minor`,
          )
          .join("\n");
        return (
          `Proforma ${p.reference} "${p.title}" — status=${p.status}, incoterm=${p.incoterm ?? "not set"}, ` +
          `payment_terms=${p.payment_terms ?? "not set"}, lead_time=${p.lead_time_note ?? "not stated"}, ` +
          `fx=${p.fx_rmb_per_usd} RMB/USD, validity=${p.validity_days} days\n${lineText || "    (no priced lines yet)"}`
        );
      })
      .join("\n\n");

    const taskInstruction =
      data.task === "draft_reply"
        ? "Draft a formal, business-register reply to the Chinese manufacturer for the request below. Keep numbers, units, dimensions, incoterms, product codes and currency exact; do not invent a price the factory has not quoted."
        : data.task === "compare_quotes"
          ? "Compare the proformas above against each other for the request below: price, incoterm, payment terms, lead time and specification differences. Point out where a like-for-like comparison is not possible because the specification differs."
          : "Answer the sourcing question below using only the proformas above.";

    const system =
      "You are Cecilia's assistant — UZA's China-based sourcing coordinator inside UZA Build, a construction " +
      "take-off/BOQ/procurement platform. Her job is coordinating with Chinese manufacturers on quotes, " +
      "specifications and logistics for finishing materials, furniture, joinery, doors and stone, then getting a " +
      "factory quote turned into an issued UZA proforma. Money below is USD in integer minor units (cents). " +
      "Never invent a price, quantity or specification that is not in the data below. UZA's non-negotiable " +
      "minimum standard for any factory relationship: " +
      MINIMUM_STANDARD.join("; ") +
      `. ${taskInstruction}\n\n` +
      `Project: ${project.name}.\n\n${digest}`;

    const answer = await askClaude(system, data.question);
    return { answer, proformasConsidered: proformas.length };
  });

/* ------------------------------------------------------------------ */
/* Procurement assistant                                                */
/* ------------------------------------------------------------------ */

function validateProcurementAssistant(input: unknown): {
  projectId: string;
  task: "status" | "draft_po_message" | "question";
  question: string;
} {
  const v = input as Partial<{ projectId: string; task: string; question: string }>;
  const task = v?.task === "draft_po_message" || v?.task === "status" ? v.task : "question";
  const label =
    task === "draft_po_message"
      ? "Say which package and what you need to tell the supplier."
      : "Ask your procurement question first.";
  return {
    projectId: requireProjectId(v?.projectId),
    task,
    question: requireQuestion(v?.question, label),
  };
}

/**
 * Procurement's assistant: surfaces what is blocking a project's sourcing
 * packages from moving forward, or drafts a purchase-order communication —
 * reading product_packages, package_requirements, package_manufacturers and
 * purchase_orders for the caller's own project. Refuses when the project has
 * no sourcing packages yet.
 */
export const procurementAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateProcurementAssistant)
  .handler(async ({ data, context }) => {
    const { data: project, error: projectError } = await context.supabase
      .from("projects")
      .select("id, name")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found, or you cannot access it.");

    const { data: packages, error: packagesError } = await context.supabase
      .from("product_packages")
      .select(
        "id, package_code, category, title, status, priority, quality_tier, required_delivery_date, target_budget_minor, budget_currency",
      )
      .eq("project_id", data.projectId)
      .order("priority", { ascending: true });
    if (packagesError) throw new Error(packagesError.message);

    if (!packages || packages.length === 0) {
      return {
        answer:
          "This project has no sourcing packages yet — nothing for me to report blockers on. " +
          "Create a package first, then ask me again.",
        packagesConsidered: 0,
      };
    }

    const packageIds = packages.map((p) => p.id);
    const [
      { data: requirements, error: reqError },
      { data: manufacturers, error: manuError },
      { data: pos, error: poError },
    ] = await Promise.all([
      context.supabase
        .from("package_requirements")
        .select("package_id, requirement_key, owner_party, status, note")
        .in("package_id", packageIds),
      context.supabase
        .from("package_manufacturers")
        .select(
          "package_id, status, deposit_paid_at, expected_ship_date, production_started_at, suppliers(name)",
        )
        .in("package_id", packageIds),
      context.supabase
        .from("purchase_orders")
        .select("po_number, status, total_minor, currency, issued_at, expected_at, suppliers(name)")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (reqError) throw new Error(reqError.message);
    if (manuError) throw new Error(manuError.message);
    if (poError) throw new Error(poError.message);

    const blockingKeys = new Set(
      PACKAGE_REQUIREMENTS.filter((r) => r.blocksSourcing).map((r) => r.key),
    );
    const reqByPackage = new Map<string, typeof requirements>();
    for (const r of requirements ?? []) {
      const bucket = reqByPackage.get(r.package_id) ?? [];
      bucket.push(r);
      reqByPackage.set(r.package_id, bucket);
    }
    const manuByPackage = new Map<string, typeof manufacturers>();
    for (const m of manufacturers ?? []) {
      const bucket = manuByPackage.get(m.package_id) ?? [];
      bucket.push(m);
      manuByPackage.set(m.package_id, bucket);
    }

    const packageDigest = packages
      .map((p) => {
        const reqs = reqByPackage.get(p.id) ?? [];
        const blocked = reqs.filter(
          (r) =>
            blockingKeys.has(r.requirement_key) &&
            r.status !== "provided" &&
            r.status !== "not_applicable",
        );
        const suppliers = manuByPackage.get(p.id) ?? [];
        const supplierText = suppliers.length
          ? suppliers
              .map((s) => {
                const supplierRow = s.suppliers as unknown as
                  { name: string } | { name: string }[] | null;
                const name = Array.isArray(supplierRow) ? supplierRow[0]?.name : supplierRow?.name;
                return `${name ?? "unnamed supplier"} (${s.status})`;
              })
              .join(", ")
          : "none shortlisted yet";
        return (
          `- [${p.package_code ?? p.id}] ${p.title} (${categoryLabel(p.category)}) — status=${packageStatusLabel(p.status)}, ` +
          `priority=${p.priority}, tier=${p.quality_tier}, delivery_needed=${p.required_delivery_date ?? "not set"}, ` +
          `suppliers: ${supplierText}` +
          (blocked.length
            ? `\n    BLOCKED on: ${blocked.map((r) => `${r.requirement_key} (owner: ${r.owner_party}, status: ${r.status})`).join("; ")}`
            : "")
        );
      })
      .join("\n");

    const poDigest = (pos ?? [])
      .map((po) => {
        const supplierRow = po.suppliers as unknown as { name: string } | { name: string }[] | null;
        const name = Array.isArray(supplierRow) ? supplierRow[0]?.name : supplierRow?.name;
        return `- PO ${po.po_number} (${name ?? "unknown supplier"}) — status=${po.status}, total_minor=${po.total_minor} ${po.currency}, issued=${po.issued_at ?? "not issued"}, expected=${po.expected_at ?? "not set"}`;
      })
      .join("\n");

    const taskInstruction =
      data.task === "draft_po_message"
        ? "Draft a purchase-order communication to the relevant supplier for the request below, using only the package and PO data above. If no supplier is shortlisted or selected for the package in question, say that a supplier must be chosen first instead of inventing one."
        : data.task === "status"
          ? "Summarise, in order of priority, what is blocking each package from moving forward, using the BLOCKED-on lines above as ground truth."
          : "Answer the procurement question below using only the packages and purchase orders above.";

    const system =
      "You are the procurement assistant inside UZA Build, a construction take-off/BOQ/procurement platform. " +
      "Procurement here means turning a project's sourcing packages (product_packages) into confirmed factories " +
      "(package_manufacturers) and issued purchase orders (purchase_orders) — not raw BOQ pricing, which is the " +
      "QS's job. A package's brief checklist (package_requirements) has some items that block sourcing until " +
      "provided and some that do not; only the ones that block sourcing matter for a status report. Money below " +
      "is integer minor units (cents), never floats. Never invent a supplier, price, quantity or delivery date " +
      `that is not in the data below. ${taskInstruction}\n\n` +
      `Project: ${project.name}.\n\nPackages:\n${packageDigest}\n\nPurchase orders:\n${poDigest || "(none issued yet)"}`;

    const answer = await askClaude(system, data.question);
    return { answer, packagesConsidered: packages.length };
  });
