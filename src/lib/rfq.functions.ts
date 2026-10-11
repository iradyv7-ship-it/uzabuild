import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { categoryLabel } from "@/config/packages";
import {
  SCHEDULE_TOKEN,
  buildRfq,
  insertSchedule,
  maskSensitive,
  renderSchedule,
  type RfqBoqLine,
  type RfqPackage,
  type RfqSensitiveNames,
} from "@/lib/rfq";

/**
 * Draft the request for quotation for one product package, in English and
 * Simplified Chinese, ready to send to the shortlisted manufacturers.
 *
 * The English RFQ is built deterministically from real rows (src/lib/rfq.ts)
 * with the client, project, site, money and rival factories already removed.
 * Claude only rewrites it into clear trade English for that product family and
 * translates it; the quantity schedule never passes through the model — it is
 * substituted back in afterwards — so a quantity cannot be invented or changed.
 * Everything is read through the caller's own RLS-scoped client.
 */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_BETA = "server-side-fallback-2026-07-01";
const MODEL = "claude-opus-5-5";
const MAX_TOKENS = 16000;

const EN = "=====ENGLISH=====";
const ZH = "=====CHINESE=====";
const ZH_ITEMS = "=====CHINESE_ITEM_DESCRIPTIONS=====";

export type RfqDraftResult = {
  reference: string;
  subject: string;
  english: string;
  chinese: string;
  warnings: string[];
  scheduleLines: number;
  /** The quantity schedule as sent — stored on package_rfqs so quotes can be matched to it. */
  schedule: { item: string; description: string; unit: string; quantity: number }[];
};

async function polish(system: string, user: string): Promise<{ text: string; truncated: boolean }> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("The RFQ drafter is not configured (no AI key).");
  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-beta": ANTHROPIC_BETA,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      fallbacks: "default",
      output_config: { effort: "medium" },
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (response.status === 429)
    throw new Error("The drafter is busy right now — try again in a moment.");
  if (response.status === 402) throw new Error("AI credits are exhausted.");
  if (!response.ok) {
    console.error("[rfq] Anthropic error", response.status, await response.text().catch(() => ""));
    throw new Error("The RFQ could not be drafted.");
  }
  const json = (await response.json()) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
  };
  if (json.stop_reason === "refusal") throw new Error("The drafter declined this request.");
  const text = (json.content ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n");
  return { text, truncated: json.stop_reason === "max_tokens" };
}

function section(text: string, start: string, end: string | null): string {
  const i = text.indexOf(start);
  if (i < 0) return "";
  const from = i + start.length;
  const j = end ? text.indexOf(end, from) : -1;
  return text.slice(from, j < 0 ? undefined : j).trim();
}

function validate(input: unknown): { packageId: string; supplierId: string | null } {
  const v = input as Partial<{ packageId: string; supplierId: string | null }>;
  if (typeof v?.packageId !== "string" || !v.packageId) throw new Error("Choose a package first.");
  return {
    packageId: v.packageId,
    supplierId: typeof v.supplierId === "string" && v.supplierId ? v.supplierId : null,
  };
}

export const draftPackageRfq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }): Promise<RfqDraftResult> => {
    const db = context.supabase;

    const { data: pkgRow, error: pkgError } = await db
      .from("product_packages")
      .select("*")
      .eq("id", data.packageId)
      .maybeSingle();
    if (pkgError) throw new Error(pkgError.message);
    if (!pkgRow) throw new Error("Package not found, or you cannot access it.");
    const pkg = pkgRow as unknown as RfqPackage & { project_id: string };

    const [requirements, attachments, manufacturers, project, boq, rooms, floors, houses, cats] =
      await Promise.all([
        db
          .from("package_requirements")
          .select("requirement_key, status")
          .eq("package_id", data.packageId),
        db
          .from("package_attachments")
          .select("kind, mime_type, uploaded_for_supplier_id, shared_with_manufacturers")
          .eq("package_id", data.packageId),
        db
          .from("package_manufacturers")
          .select("supplier_id, suppliers(name)")
          .eq("package_id", data.packageId),
        db
          .from("projects")
          .select("name, client_name, location, client_id")
          .eq("id", pkg.project_id)
          .maybeSingle(),
        db
          .from("boq_lines")
          .select(
            "description, unit, quantity, room_id, floor_id, house_id, catalog_items(name, category_id)",
          )
          .eq("project_id", pkg.project_id)
          .limit(2000),
        db.from("rooms").select("id, name, floor_id").eq("project_id", pkg.project_id),
        db.from("floors").select("id, name, house_id").eq("project_id", pkg.project_id),
        db.from("houses").select("id, name, quantity").eq("project_id", pkg.project_id),
        db.from("catalog_categories").select("id, slug"),
      ]);
    for (const r of [requirements, attachments, manufacturers, boq])
      if (r.error) throw new Error(r.error.message);

    // Names that must never reach a manufacturer. The client row may be out of
    // this seat's reach; the project's own client_name still covers it.
    let clientName: string | null = project.data?.client_name ?? null;
    let clientContact: string | null = null;
    if (project.data?.client_id) {
      const { data: client } = await db
        .from("clients")
        .select("name, contact_name, decision_maker_name")
        .eq("id", project.data.client_id)
        .maybeSingle();
      clientName = client?.name ?? clientName;
      clientContact = client?.contact_name ?? client?.decision_maker_name ?? null;
    }

    type MfrRow = { supplier_id: string; suppliers: { name: string } | { name: string }[] | null };
    const supplierName = (m: MfrRow) =>
      (Array.isArray(m.suppliers) ? m.suppliers[0]?.name : m.suppliers?.name) ?? null;
    const mfrs = (manufacturers.data ?? []) as unknown as MfrRow[];
    const target = data.supplierId
      ? mfrs.find((m) => m.supplier_id === data.supplierId)
      : undefined;
    if (data.supplierId && !target)
      throw new Error("That manufacturer is not shortlisted on this package.");

    const names: RfqSensitiveNames = {
      clientName,
      clientContact,
      projectName: project.data?.name ?? null,
      projectLocation: project.data?.location ?? null,
      otherManufacturers: mfrs.filter((m) => m.supplier_id !== data.supplierId).map(supplierName),
    };

    const slugById = new Map((cats.data ?? []).map((c) => [c.id, c.slug]));
    const roomById = new Map((rooms.data ?? []).map((r) => [r.id, r]));
    const floorById = new Map((floors.data ?? []).map((f) => [f.id, f]));
    const houseById = new Map((houses.data ?? []).map((h) => [h.id, h]));

    type BoqRow = {
      description: string;
      unit: string;
      quantity: number | string;
      room_id: string | null;
      floor_id: string | null;
      house_id: string | null;
      catalog_items:
        { name: string; category_id: string } | { name: string; category_id: string }[] | null;
    };
    const boqLines: RfqBoqLine[] = ((boq.data ?? []) as unknown as BoqRow[]).map((l) => {
      const item = Array.isArray(l.catalog_items) ? l.catalog_items[0] : l.catalog_items;
      const room = l.room_id ? roomById.get(l.room_id) : undefined;
      const floor = floorById.get(room?.floor_id ?? l.floor_id ?? "");
      const house = houseById.get(floor?.house_id ?? l.house_id ?? "");
      const where = [house?.name, floor?.name, room?.name].filter(Boolean).join(" / ");
      return {
        description: l.description,
        unit: l.unit,
        quantity: Number(l.quantity),
        catalogSlug: item ? (slugById.get(item.category_id) ?? null) : null,
        catalogItemName: item?.name ?? null,
        locationLabel: where || null,
        multiplier: Number(house?.quantity ?? 1) || 1,
      };
    });

    // Only files a person has released to factories are part of the RFQ —
    // a factory cannot open anything else, so the RFQ must not promise it.
    const sharedAttachments = (attachments.data ?? []).filter(
      (a) => a.uploaded_for_supplier_id === null && a.shared_with_manufacturers,
    );
    const unreleased = (attachments.data ?? []).filter(
      (a) => a.uploaded_for_supplier_id === null && !a.shared_with_manufacturers,
    ).length;

    const draft = buildRfq({
      pkg,
      requirements: requirements.data ?? [],
      attachments: sharedAttachments,
      boqLines,
      names,
      salutation: target ? supplierName(target) : null,
    });

    const englishSchedule = renderSchedule(draft.schedule, "en");
    const descriptions = draft.schedule.map((r, i) => `${i + 1}|${r.description}`).join("\n");

    const system =
      "You prepare requests for quotation that UZA Build, a finishing contractor in Kigali, Rwanda, sends to " +
      "manufacturers in China. Rewrite the draft RFQ you are given into clear, courteous trade English for the " +
      `product family "${categoryLabel(pkg.category)}", then translate it faithfully into Simplified Chinese as ` +
      "a Chinese sourcing professional would write it.\n\nRules you must keep:\n" +
      `- Keep the line ${SCHEDULE_TOKEN} exactly as it is, on its own line, in BOTH versions. Do not write a quantity table yourself.\n` +
      "- Do not add, change or remove any quantity, size, date, reference or specification value. Do not invent " +
      "facts. You may reorder and reword, and you may make each 'ALSO CONFIRM' question more precise for this " +
      "product family, but keep every question.\n" +
      "- Never mention prices, budgets, the client, the end user or the project; none are in the draft and none may be added.\n" +
      "- Keep the reference code unchanged in both versions.\n\n" +
      `Answer in exactly three sections and nothing else:\n${EN}\n<the English RFQ>\n${ZH}\n<the Chinese RFQ>\n` +
      `${ZH_ITEMS}\n<one line per schedule item, as "number|Chinese description", same numbering, same count>`;

    const user =
      `SUBJECT: ${draft.subject}\n\nDRAFT RFQ:\n${draft.body}\n\nSCHEDULE ITEM DESCRIPTIONS TO TRANSLATE:\n` +
      (descriptions || "(none)");

    const warnings = [...draft.warnings];
    if (unreleased > 0) {
      warnings.push(
        `${unreleased} package file(s) are not released to factories yet, so they are not mentioned. Check each one for the client's name or title block, then release it in the package file room.`,
      );
    }
    let english = insertSchedule(draft.body, englishSchedule).text;
    let chinese = "";

    try {
      const out = await polish(system, user);
      if (out.truncated)
        warnings.push("The AI answer was cut off; check the end of both versions.");
      const enBody = section(out.text, EN, ZH);
      const zhBody = section(out.text, ZH, ZH_ITEMS);
      const zhItems = section(out.text, ZH_ITEMS, null)
        .split("\n")
        .map((s) => s.split("|").slice(1).join("|").trim())
        .filter(Boolean);
      const zhDescriptions = zhItems.length === draft.schedule.length ? zhItems : undefined;
      if (draft.schedule.length > 0 && !zhDescriptions) {
        warnings.push(
          "Item descriptions in the Chinese schedule were left in English (translation count did not match).",
        );
      }

      if (enBody) {
        const placed = insertSchedule(maskSensitive(enBody, names).text, englishSchedule);
        if (!placed.tokenFound)
          warnings.push(
            "The schedule position was lost in the English version; it was added at the end.",
          );
        english = placed.text;
      } else {
        warnings.push("The AI polish did not return an English version; the plain draft is shown.");
      }
      if (zhBody) {
        const placed = insertSchedule(
          maskSensitive(zhBody, names).text,
          renderSchedule(draft.schedule, "zh", zhDescriptions),
        );
        if (!placed.tokenFound)
          warnings.push(
            "The schedule position was lost in the Chinese version; it was added at the end.",
          );
        chinese = placed.text;
      } else {
        warnings.push(
          "No Chinese version was returned. Draft again, or translate the English before sending.",
        );
      }
    } catch (e) {
      warnings.push(
        `${e instanceof Error ? e.message : "The AI polish failed."} The plain English draft is shown; there is no Chinese version yet.`,
      );
    }

    return {
      reference: draft.reference,
      subject: draft.subject,
      english,
      chinese,
      warnings,
      scheduleLines: draft.schedule.length,
      schedule: draft.schedule.map((r) => ({
        item: r.item,
        description: r.description,
        unit: r.unit,
        quantity: r.quantity,
      })),
    };
  });
