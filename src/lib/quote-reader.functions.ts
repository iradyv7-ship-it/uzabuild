import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_IMAGE_BYTES, readAnyDocument } from "@/lib/drawing-reader.server";
import { parseSchedule, type ScheduleItem } from "@/lib/quote-compare";
import { toMinor } from "@/lib/pricing";
import type { CurrencyCode } from "@/config/policy";

/**
 * Reads a factory quotation file — PDF, photo, Excel or Word, in English or
 * Chinese — into priced lines matched to the RFQ schedule that factory was
 * sent, so quotes compare like for like.
 *
 * Runs as the caller: a factory can only read its own quote and a staff member
 * only quotes on projects they can see (can_read_quote / can_edit_quote in
 * 20261011090000). The model transcribes; it never invents a price or a
 * quantity — anything not printed stays null and is reported.
 */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_BETA = "server-side-fallback-2026-07-01";
const MODEL = "claude-opus-5-5";
const MAX_TOKENS = 16000;
const MAX_FILE_BYTES = 18 * 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;

type ExtractedLine = {
  schedule_item: string | null;
  description: string;
  original_description: string | null;
  specification: string | null;
  unit: string | null;
  quantity: number | null;
  unit_price: number | null;
  source_ref: string | null;
};

type Extracted = {
  currency: string | null;
  incoterm: string | null;
  lead_time_days: number | null;
  moq: string | null;
  valid_until: string | null;
  payment_terms: string | null;
  sample_available: boolean | null;
  lines: ExtractedLine[];
};

const nullable = (type: string, description: string) => ({
  anyOf: [{ type }, { type: "null" }],
  description,
});

const TOOL = {
  name: "record_quotation",
  description:
    "Record every priced line and the commercial terms printed on this factory quotation.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      currency: nullable(
        "string",
        "ISO currency printed for the prices: CNY (RMB/¥/元), USD ($) or RWF. Null if not stated.",
      ),
      incoterm: nullable("string", "e.g. FOB Foshan, EXW, CIF Mombasa — as printed."),
      lead_time_days: nullable(
        "integer",
        "Production/delivery lead time in days, converted from weeks if stated in weeks.",
      ),
      moq: nullable("string", "Minimum order quantity terms, as printed."),
      valid_until: nullable(
        "string",
        "Quotation validity as an ISO date YYYY-MM-DD, only if a date or a validity period from a printed quote date is stated.",
      ),
      payment_terms: nullable("string", "Payment terms as printed, in English."),
      sample_available: nullable(
        "boolean",
        "True/false only if the quote says whether samples are available.",
      ),
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            schedule_item: nullable(
              "string",
              "The RFQ schedule item number this line answers, or null for an item that is not in the schedule.",
            ),
            description: { type: "string", description: "The item in English." },
            original_description: nullable(
              "string",
              "The description exactly as printed if it was not English.",
            ),
            specification: nullable("string", "Size, model, finish, grade — as printed."),
            unit: nullable("string", "Unit as printed (m2, pcs, set, 平方米…)."),
            quantity: nullable("number", "Quantity exactly as printed; null if not printed."),
            unit_price: nullable(
              "number",
              "Unit price in major units (e.g. 58.50), exactly as printed; null if not printed. Never compute it from a total unless the line prints only a quantity and a line total.",
            ),
            source_ref: nullable("string", "Where it was read: page number or spreadsheet row."),
          },
          required: [
            "schedule_item",
            "description",
            "original_description",
            "specification",
            "unit",
            "quantity",
            "unit_price",
            "source_ref",
          ],
          additionalProperties: false,
        },
      },
    },
    required: [
      "currency",
      "incoterm",
      "lead_time_days",
      "moq",
      "valid_until",
      "payment_terms",
      "sample_available",
      "lines",
    ],
    additionalProperties: false,
  },
} as const;

const SYSTEM =
  "You transcribe factory quotations (often from Chinese manufacturers, often in Chinese) for a construction " +
  "finishing company. Record one line per priced item. Copy quantities and prices exactly as printed — never " +
  "estimate, round, convert currency or invent a value; if a value is not printed, use null. Translate item " +
  "descriptions to English and keep the original wording in original_description. Match each line to the RFQ " +
  "schedule item it answers using the schedule given (same product, size and finish); if it answers none, use " +
  "null. Ignore sub-totals, totals, freight summaries and bank details as items. Always answer by calling the " +
  "record_quotation tool.";

type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function extract(apiKey: string, content: Block[]): Promise<Extracted> {
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
      output_config: { effort: "low" },
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content }],
    }),
  });

  if (response.status === 429)
    throw new Error("The quote reader is busy right now — try again in a moment.");
  if (response.status === 402) throw new Error("AI credits are exhausted.");
  if (response.status === 413)
    throw new Error("This quotation is too large to read in one go — send a smaller file.");
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? "";
      console.error("[readFactoryQuote] Anthropic API error", response.status, body);
    } catch {
      console.error("[readFactoryQuote] Anthropic API error", response.status);
    }
    throw new Error(`The quotation could not be read${detail ? `: ${detail}` : "."}`);
  }

  const json = (await response.json()) as {
    stop_reason?: string;
    content?: { type: string; name?: string; input?: Extracted }[];
  };
  if (json.stop_reason === "refusal") throw new Error("The quote reader declined this file.");
  if (json.stop_reason === "max_tokens") {
    throw new Error(
      "This quotation has too many lines for one read — split it and upload it in parts.",
    );
  }
  const tool = json.content?.find((b) => b.type === "tool_use" && b.name === TOOL.name);
  if (!tool?.input) throw new Error("The quote reader returned nothing for this file.");
  return tool.input;
}

const CURRENCIES: readonly CurrencyCode[] = ["CNY", "USD", "RWF"];

function asCurrency(v: string | null): CurrencyCode | null {
  if (!v) return null;
  const u = v.trim().toUpperCase();
  if (u === "RMB" || u === "CNY" || u === "¥" || u === "元") return "CNY";
  if (u === "USD" || u === "$" || u === "US$") return "USD";
  if (u === "RWF" || u === "FRW") return "RWF";
  return CURRENCIES.includes(u as CurrencyCode) ? (u as CurrencyCode) : null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown, max = 500) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export const readFactoryQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = input as Partial<{ quoteId: string }>;
    if (typeof v?.quoteId !== "string" || !v.quoteId)
      throw new Error("Choose a quotation to read.");
    return { quoteId: v.quoteId };
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new Error("The quote reader is not configured.");

    const { data: quote, error } = await context.supabase
      .from("factory_quotes")
      .select("*")
      .eq("id", data.quoteId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!quote) throw new Error("That quotation is not available to you.");
    if (!quote.attachment_path || !quote.file_name) {
      throw new Error("This quotation has no file to read — enter its lines by hand.");
    }
    if (!["submitted", "parsed", "under_review", "shortlisted"].includes(quote.status)) {
      throw new Error("This quotation has been decided or withdrawn and can no longer be re-read.");
    }

    const { data: rfq } = await context.supabase
      .from("package_rfqs")
      .select("reference, schedule")
      .eq("package_id", quote.package_id)
      .eq("supplier_id", quote.supplier_id)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const schedule: ScheduleItem[] = parseSchedule(rfq?.schedule);

    const file = await context.supabase.storage.from("drawings").download(quote.attachment_path);
    if (file.error || !file.data) throw new Error("The stored quotation file could not be opened.");
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    if (bytes.byteLength > MAX_FILE_BYTES) {
      throw new Error("The quotation file is larger than 18 MB — send a smaller PDF or split it.");
    }

    const source = await readAnyDocument({
      bytes,
      fileName: quote.file_name,
      mimeType: file.data.type,
    });
    if (source.mode === "unsupported")
      throw new Error(source.reason ?? "This file type cannot be read.");

    const scheduleText = schedule.length
      ? schedule.map((s) => `${s.item}. ${s.description} — ${s.quantity} ${s.unit}`).join("\n")
      : "(No schedule on record — set schedule_item to null for every line.)";

    const content: Block[] = [
      {
        type: "text",
        text:
          `RFQ ${rfq?.reference ?? ""} schedule the factory was asked to price:\n${scheduleText}\n\n` +
          `The quotation file "${quote.file_name}" follows.`,
      },
    ];
    if (source.mode === "file" && source.bytes && source.mimeType) {
      if (source.mimeType.startsWith("image/") && source.bytes.byteLength > MAX_IMAGE_BYTES) {
        throw new Error(
          "This photo is larger than 5 MB — send a smaller photo or a PDF of the quotation.",
        );
      }
      content.push(
        source.mimeType === "application/pdf"
          ? {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: toBase64(source.bytes),
              },
            }
          : {
              type: "image",
              source: { type: "base64", media_type: source.mimeType, data: toBase64(source.bytes) },
            },
      );
    } else {
      const body = source.text ?? "";
      if (!body.trim()) throw new Error("Nothing readable was found in this quotation file.");
      content.push({
        type: "text",
        text: `[${source.method}]\n${body.slice(0, MAX_TEXT_CHARS)}${body.length > MAX_TEXT_CHARS ? "\n[truncated]" : ""}`,
      });
    }
    content.push({
      type: "text",
      text: "Call record_quotation with every priced line and the printed terms.",
    });

    const out = await extract(apiKey, content);

    const warnings: string[] = [];
    const printed = asCurrency(out.currency);
    const currency: CurrencyCode = printed ?? (quote.currency as CurrencyCode);
    if (!printed)
      warnings.push(`No currency printed — prices taken as ${currency}. Check before comparing.`);
    else if (printed !== quote.currency) {
      warnings.push(
        `The quotation is priced in ${printed}; the quote record has been set to ${printed}.`,
      );
    }

    const validKeys = new Set(schedule.map((s) => s.item));
    const rows = (out.lines ?? [])
      .map((l, i) => {
        const description = text(l.description, 1000);
        if (!description) return null;
        const price = num(l.unit_price);
        const key =
          l.schedule_item !== null && validKeys.has(String(l.schedule_item).trim())
            ? String(l.schedule_item).trim()
            : null;
        const original = text(l.original_description, 1000);
        const spec = text(l.specification, 1000);
        return {
          quote_id: quote.id,
          package_id: quote.package_id,
          line_no: i + 1,
          schedule_key: key,
          description,
          specification:
            [spec, original && original !== description ? `原文: ${original}` : null]
              .filter(Boolean)
              .join(" · ") || null,
          unit: text(l.unit, 30),
          quantity: num(l.quantity),
          unit_price_minor: price === null ? null : toMinor(price, currency),
          currency,
          source_ref: text(l.source_ref, 60),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) warnings.push("No priced lines were found in this file.");
    const noPrice = rows.filter((r) => r.unit_price_minor === null).length;
    if (noPrice) warnings.push(`${noPrice} line(s) have no unit price printed.`);
    for (const s of schedule) {
      const answers = rows.filter((r) => r.schedule_key === s.item);
      if (answers.length === 0) {
        warnings.push(`Not quoted: item ${s.item} — ${s.description}.`);
        continue;
      }
      const qty = answers.reduce<number | null>(
        (t, r) => (r.quantity === null ? t : (t ?? 0) + r.quantity),
        null,
      );
      if (qty !== null && s.quantity > 0 && Math.abs(qty - s.quantity) / s.quantity > 0.01) {
        warnings.push(
          `Item ${s.item}: quoted ${qty} ${answers[0]!.unit ?? ""} against ${s.quantity} ${s.unit} asked.`,
        );
      }
    }
    const extras = rows.filter((r) => r.schedule_key === null).length;
    if (extras && schedule.length)
      warnings.push(`${extras} line(s) are not in the RFQ schedule (extras or alternatives).`);

    let total = 0;
    let anyTotal = false;
    for (const r of rows) {
      const s = schedule.find((x) => x.item === r.schedule_key);
      const q = r.quantity ?? (s ? s.quantity : null);
      if (q !== null && r.unit_price_minor !== null) {
        total += Math.round(q * r.unit_price_minor);
        anyTotal = true;
      }
    }

    const { error: delError } = await context.supabase
      .from("factory_quote_lines")
      .delete()
      .eq("quote_id", quote.id);
    if (delError) throw new Error(delError.message);
    if (rows.length > 0) {
      const { error: insError } = await context.supabase.from("factory_quote_lines").insert(rows);
      if (insError) throw new Error(insError.message);
    }

    const leadDays = num(out.lead_time_days);
    const validUntil = text(out.valid_until, 10);
    const { error: upError } = await context.supabase
      .from("factory_quotes")
      .update({
        currency,
        total_minor: anyTotal ? total : null,
        parse_warnings: warnings,
        parsed_at: new Date().toISOString(),
        ...(quote.status === "submitted" ? { status: "parsed" } : {}),
        ...(quote.incoterm ? {} : { incoterm: text(out.incoterm, 120) }),
        ...(quote.lead_time_days !== null || leadDays === null
          ? {}
          : { lead_time_days: Math.max(0, Math.round(leadDays)) }),
        ...(quote.moq_note ? {} : { moq_note: text(out.moq, 300) }),
        ...(quote.valid_until || !validUntil || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)
          ? {}
          : { valid_until: validUntil }),
        ...(quote.payment_terms ? {} : { payment_terms: text(out.payment_terms, 300) }),
        ...(quote.sample_available !== null || typeof out.sample_available !== "boolean"
          ? {}
          : { sample_available: out.sample_available }),
      })
      .eq("id", quote.id);
    if (upError) throw new Error(upError.message);

    return { lines: rows.length, warnings, totalMinor: anyTotal ? total : null };
  });
