import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
/** Opus 5. Short, schema-forced extraction — no extended thinking needed. */
const MODEL = "claude-opus-5";
const MAX_TOKENS = 8192;

export type ParsedQuoteLine = {
  description: string;
  original_description: string;
  specification: string;
  unit: string;
  quantity: number;
  unit_price_rmb: number;
};

function validate(input: unknown): { text: string } {
  const value = input as Partial<{ text: string }>;
  if (!value || typeof value.text !== "string" || value.text.trim().length === 0) {
    throw new Error("Paste the factory quotation first.");
  }
  return { text: value.text.slice(0, 12000) };
}

/**
 * Client-facing documents are English. Factory quotations use Chinese unit
 * characters, so they are mapped to the English unit that means the same thing.
 */
const UNIT_TRANSLATIONS: Record<string, string> = {
  "㎡": "m2",
  平方米: "m2",
  平米: "m2",
  "m²": "m2",
  "㎥": "m3",
  立方米: "m3",
  米: "m",
  延米: "m",
  个: "pcs",
  件: "pcs",
  只: "pcs",
  张: "pcs",
  块: "pcs",
  樘: "leaf",
  扇: "leaf",
  套: "set",
  组: "set",
  台: "unit",
  桶: "drum",
  卷: "roll",
  平方: "m2",
  吨: "t",
  公斤: "kg",
};

function normaliseUnit(unit: string): string {
  const trimmed = unit.trim();
  if (trimmed === "") return "pcs";
  return UNIT_TRANSLATIONS[trimmed] ?? trimmed;
}

const TOOL = {
  name: "record_quote_lines",
  description: "Record every priced line found in a factory quotation.",
  input_schema: {
    type: "object",
    properties: {
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "Item description translated into English",
            },
            original_description: {
              type: "string",
              description: "The description exactly as written by the factory",
            },
            specification: {
              type: "string",
              description: "Size, finish, material, model code. Empty string if absent.",
            },
            unit: { type: "string", description: "pcs, m2, set, etc. Empty string if absent." },
            quantity: { type: "number" },
            unit_price_rmb: {
              type: "number",
              description: "Unit price in RMB. 0 if not stated.",
            },
          },
          required: [
            "description",
            "original_description",
            "specification",
            "unit",
            "quantity",
            "unit_price_rmb",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["lines"],
    additionalProperties: false,
  },
} as const;

/**
 * Reads a factory quotation (Chinese or English, pasted as text) and returns
 * draft proforma lines with English descriptions and RMB unit prices.
 * Everything it returns is a draft: the original wording is kept on every line
 * and a human confirms before the proforma is issued.
 */
export const parseFactoryQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data }) => {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new Error("Quote reading is not configured.");

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
        system:
          "You extract priced lines from Chinese or English factory quotations for construction finishing materials, " +
          "furniture, joinery, doors and stone. Translate descriptions into formal English. Preserve numbers, units, " +
          "dimensions, finishes and model codes exactly. Never invent a price or a quantity: use 0 when it is not stated. " +
          "Ignore totals, taxes, bank details and commentary rows.",
        messages: [{ role: "user", content: data.text }],
        tools: [TOOL],
        tool_choice: { type: "tool", name: "record_quote_lines" },
      }),
    });

    if (response.status === 429)
      throw new Error("Quote reading is busy right now — try again in a moment.");
    if (response.status === 402) throw new Error("AI credits are exhausted.");
    if (!response.ok) throw new Error("Could not read that quotation.");

    const json = (await response.json()) as {
      content?: { type: string; input?: { lines?: ParsedQuoteLine[] } }[];
    };
    const toolUse = json.content?.find((block) => block.type === "tool_use");
    if (!toolUse?.input) throw new Error("No priced lines were found in that quotation.");

    const parsed = toolUse.input;
    const lines = (parsed.lines ?? []).filter(
      (l) => typeof l.description === "string" && l.description.trim() !== "",
    );
    if (lines.length === 0) throw new Error("No priced lines were found in that quotation.");

    return {
      lines: lines.map((l) => ({
        description: l.description.trim(),
        original_description: (l.original_description ?? "").trim(),
        specification: (l.specification ?? "").trim(),
        unit: normaliseUnit(l.unit ?? ""),
        quantity: Number.isFinite(l.quantity) && l.quantity > 0 ? l.quantity : 1,
        unit_price_rmb:
          Number.isFinite(l.unit_price_rmb) && l.unit_price_rmb > 0 ? l.unit_price_rmb : 0,
      })),
    };
  });
