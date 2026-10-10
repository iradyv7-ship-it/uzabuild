import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extensionOf } from "@/lib/drawing-reader.server";
import { isSpreadsheet, spreadsheetToText } from "@/lib/office-reader.server";

/**
 * Reads an existing Bill of Quantities spreadsheet — a client's, a
 * consultant's or a factory's, priced or blank-rate — into structured rows a
 * QS can review before anything is written to the BOQ.
 *
 * The sheet is parsed with SheetJS (numbers and row order intact) and sent to
 * the model in chunks of rows, carrying the house / floor / room the previous
 * chunk ended in, so a 1,000-line BOQ is never cut off mid-answer. The model
 * only structures what is printed: it never invents a quantity or a rate, and
 * a blank rate stays null. Nothing here writes to the database — the preview
 * dialog does that once a person has checked the rows.
 */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
/** Server-side refusal fallback: a declined request is re-run on a fallback model in the same call. */
const ANTHROPIC_BETA = "server-side-fallback-2026-07-01";
const MODEL = "claude-opus-5-5";
const MAX_TOKENS = 16000;
/** Characters of sheet text per model call — about 250–400 BOQ rows. */
const CHUNK_CHARS = 24_000;
const MAX_CHUNKS = 12;
const MAX_FILE_BYTES = 18 * 1024 * 1024;

export type ImportedBoqRow = {
  source_row: number | null;
  sheet: string;
  house: string;
  floor: string;
  room: string;
  item_ref: string;
  description: string;
  unit: string;
  quantity: number | null;
  rate: number | null;
  currency: string | null;
};

const TOOL = {
  name: "record_boq_rows",
  description:
    "Record every measurable BOQ item in this part of the spreadsheet, with the section it sits under.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            source_row: {
              anyOf: [{ type: "integer" }, { type: "null" }],
              description: "The spreadsheet row number printed at the start of the line.",
            },
            sheet: { type: "string", description: "Sheet name the row came from." },
            house: {
              type: "string",
              description:
                "Block / house / building / bill section this item belongs to (e.g. 'Block A', 'Villa Type 2', 'Bill 3 — Finishes'). Empty string if none.",
            },
            floor: {
              type: "string",
              description: "Floor or level (e.g. 'Ground floor', 'Level 2'). Empty string if none.",
            },
            room: {
              type: "string",
              description:
                "Room, area or element group (e.g. 'Master bathroom', 'Corridors'). Empty string if none.",
            },
            item_ref: {
              type: "string",
              description: "Item number / reference as printed. Empty string if none.",
            },
            description: {
              type: "string",
              description: "The item description, as printed (merge wrapped lines).",
            },
            unit: {
              type: "string",
              description: "Unit as printed (m2, m, no, pcs, item, sum...). Empty string if none.",
            },
            quantity: {
              anyOf: [{ type: "number" }, { type: "null" }],
              description: "Quantity as printed; null if blank.",
            },
            rate: {
              anyOf: [{ type: "number" }, { type: "null" }],
              description: "Unit rate as printed; null if blank (blank-rate BOQ).",
            },
            currency: {
              anyOf: [{ type: "string" }, { type: "null" }],
              description: "ISO code if the sheet states it (RWF, USD, CNY...); null otherwise.",
            },
          },
          required: [
            "source_row",
            "sheet",
            "house",
            "floor",
            "room",
            "item_ref",
            "description",
            "unit",
            "quantity",
            "rate",
            "currency",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["rows"],
    additionalProperties: false,
  },
} as const;

const SYSTEM =
  "You are a quantity surveyor transcribing an existing Bill of Quantities spreadsheet into structured rows. " +
  "Each input line is a spreadsheet row: the row number, then its cells separated by tabs. " +
  "Return one row per measurable item (one that has a description and a unit or a quantity). Do not return " +
  "headings, sub-totals, totals, carried-forward lines, notes or blank rows as items — use headings only to fill " +
  "the house / floor / room the following items belong to. Copy numbers exactly as printed; never compute, " +
  "estimate or invent a quantity or a rate. A blank rate is null. If an item's amount is printed but its rate is " +
  "not, leave the rate null. Keep the original order. Always answer by calling the record_boq_rows tool.";

/** A BOQ unit tells us how the quantity was measured. */
export function methodForUnit(unit: string): string {
  const u = unit
    .trim()
    .toLowerCase()
    .replace(/[²³.]/g, (c) => (c === "²" ? "2" : c === "³" ? "3" : ""));
  if (/^(m2|sqm|sq ?m|m\^2|ft2|sqft)$/.test(u)) return "area";
  if (/^(m3|cum|cu ?m|m\^3)$/.test(u)) return "volume";
  if (/^(m|lm|rm|ml|lin ?m|ft)$/.test(u)) return "linear";
  if (/^(item|items|sum|ls|l\/s|lump ?sum|prov ?sum|ps)$/.test(u)) return "lump";
  return "count";
}

type Context = { house: string; floor: string; room: string };

/** Splits sheet text into chunks on row boundaries, repeating the sheet header in each. */
export function chunkSheetText(text: string, size = CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let current = "";
  let header = "";
  for (const line of text.split("\n")) {
    if (line.startsWith("## Sheet:")) {
      if (current.trim()) chunks.push(current);
      header = line;
      current = `${line}\n`;
      continue;
    }
    if (current.length + line.length + 1 > size && current.trim() !== header) {
      chunks.push(current);
      current = `${header} (continued)\n`;
    }
    current += `${line}\n`;
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

async function readChunk(
  apiKey: string,
  chunk: string,
  context: Context,
  part: number,
  total: number,
) {
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
      messages: [
        {
          role: "user",
          content:
            `Part ${part} of ${total} of the spreadsheet.` +
            (context.house || context.floor || context.room
              ? ` The previous part ended inside: house "${context.house}", floor "${context.floor}", room "${context.room}" — items at the top of this part belong there until a new heading appears.`
              : "") +
            `\n\n${chunk}\n\nCall record_boq_rows with every measurable item in this part.`,
        },
      ],
    }),
  });

  if (response.status === 429)
    throw new Error("The BOQ reader is busy right now — try again in a moment.");
  if (response.status === 402) throw new Error("AI credits are exhausted.");
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? "";
      console.error("[importBoq] Anthropic API error", response.status, body);
    } catch {
      console.error("[importBoq] Anthropic API error", response.status);
    }
    throw new Error(`The BOQ reader could not read part ${part}${detail ? `: ${detail}` : "."}`);
  }

  const json = (await response.json()) as {
    stop_reason?: string;
    content?: { type: string; name?: string; input?: { rows?: ImportedBoqRow[] } }[];
  };
  if (json.stop_reason === "refusal")
    throw new Error(`The BOQ reader declined part ${part} of this file.`);
  if (json.stop_reason === "max_tokens") {
    throw new Error(
      `Part ${part} of this BOQ has too many lines for one read — split the sheet and import it in parts.`,
    );
  }
  const tool = json.content?.find((b) => b.type === "tool_use" && b.name === TOOL.name);
  if (!tool?.input) throw new Error(`The BOQ reader returned nothing for part ${part}.`);
  return tool.input.rows ?? [];
}

function clean(row: ImportedBoqRow): ImportedBoqRow | null {
  const description = String(row.description ?? "").trim();
  if (!description) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    source_row: typeof row.source_row === "number" ? row.source_row : null,
    sheet: String(row.sheet ?? "").trim(),
    house: String(row.house ?? "").trim(),
    floor: String(row.floor ?? "").trim(),
    room: String(row.room ?? "").trim(),
    item_ref: String(row.item_ref ?? "").trim(),
    description: description.slice(0, 1000),
    unit: String(row.unit ?? "")
      .trim()
      .slice(0, 30),
    quantity: num(row.quantity),
    rate: num(row.rate),
    currency: row.currency ? String(row.currency).trim().toUpperCase().slice(0, 3) : null,
  };
}

export const readBoqSpreadsheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = input as Partial<{ drawingId: string }>;
    if (typeof v?.drawingId !== "string" || !v.drawingId)
      throw new Error("Choose a spreadsheet to import.");
    return { drawingId: v.drawingId };
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new Error("BOQ import is not configured.");

    // Read through the caller's own session: only a file they may read.
    const { data: drawing, error } = await context.supabase
      .from("drawings")
      .select("id, project_id, file_name, storage_path, size_bytes")
      .eq("id", data.drawingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!drawing) throw new Error("That file is not available to you.");
    if (!isSpreadsheet(extensionOf(drawing.file_name))) {
      throw new Error("Only spreadsheets (XLSX, XLS, ODS, CSV) can be imported as a BOQ.");
    }
    if (drawing.size_bytes && Number(drawing.size_bytes) > MAX_FILE_BYTES) {
      throw new Error("This spreadsheet is larger than 18 MB — split it and import each part.");
    }

    const file = await context.supabase.storage.from("drawings").download(drawing.storage_path);
    if (file.error || !file.data) throw new Error("The stored spreadsheet could not be opened.");
    const bytes = new Uint8Array(await file.data.arrayBuffer());

    let sheet;
    try {
      sheet = spreadsheetToText(bytes, drawing.file_name);
    } catch (e) {
      throw new Error(
        `This spreadsheet could not be opened (${e instanceof Error ? e.message : "unreadable"}). Re-save it as XLSX and try again.`,
      );
    }
    if (!sheet.text.trim()) throw new Error("This spreadsheet has no data in it.");

    const chunks = chunkSheetText(sheet.text);
    if (chunks.length > MAX_CHUNKS) {
      throw new Error(
        `This workbook is too large to import at once (${chunks.length} parts). Split it into separate files of a few hundred lines each.`,
      );
    }

    const rows: ImportedBoqRow[] = [];
    let ctx: Context = { house: "", floor: "", room: "" };
    for (let i = 0; i < chunks.length; i++) {
      const part = await readChunk(apiKey, chunks[i]!, ctx, i + 1, chunks.length);
      for (const r of part) {
        const c = clean(r);
        if (c) rows.push(c);
      }
      const last = rows[rows.length - 1];
      if (last) ctx = { house: last.house, floor: last.floor, room: last.room };
    }

    return {
      projectId: drawing.project_id,
      fileName: drawing.file_name,
      sheets: sheet.sheets,
      truncated: sheet.truncated,
      rows,
    };
  });
