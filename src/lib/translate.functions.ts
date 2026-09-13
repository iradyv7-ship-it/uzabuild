import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
/** Opus 5. Short, plain-text turnaround — no extended thinking needed. */
const MODEL = "claude-opus-5";
const MAX_TOKENS = 4096;

export type TranslateInput = { text: string; target: "en" | "zh" };

function validate(input: unknown): TranslateInput {
  const value = input as Partial<TranslateInput>;
  if (!value || typeof value.text !== "string" || value.text.trim().length === 0) {
    throw new Error("Nothing to translate.");
  }
  if (value.target !== "en" && value.target !== "zh")
    throw new Error("Unsupported target language.");
  return { text: value.text.slice(0, 6000), target: value.target };
}

/**
 * Translates a coordination message between English and Chinese so the Kigali
 * team and a Chinese factory can each write in their own language. The original
 * text is always kept alongside the translation — we never replace what a
 * person actually wrote.
 */
export const translateMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data }) => {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new Error("Translation is not configured.");

    const targetName = data.target === "zh" ? "Simplified Chinese" : "English";
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
          "You translate construction and procurement correspondence between English and Chinese. " +
          "Keep a formal business register. Preserve numbers, units, dimensions, incoterms, product codes and " +
          "currency symbols exactly. Do not add commentary. Return only the translation.",
        messages: [{ role: "user", content: `Translate into ${targetName}:\n\n${data.text}` }],
      }),
    });

    if (response.status === 429)
      throw new Error("Translation is busy right now — try again in a moment.");
    if (response.status === 402) throw new Error("Translation credits are exhausted.");
    if (!response.ok) throw new Error("Translation failed.");

    const json = (await response.json()) as { content?: { type: string; text?: string }[] };
    const translated = json.content?.find((block) => block.type === "text")?.text?.trim();
    if (!translated) throw new Error("Translation returned nothing.");
    return { translated, language: data.target };
  });

/* ------------------------------------------------------------------ */
/* BOQ translation — line-by-line, structured, both directions          */
/* ------------------------------------------------------------------ */

/**
 * One BOQ line, from either side: UZA's own takeoff/BOQ (`boq_lines`) or a
 * manufacturer's submitted quote (`ParsedQuoteLine` in proforma.functions.ts)
 * both reduce to this same shape for translation purposes. Deliberately
 * minimal — only the free-text fields a translator would touch.
 */
export type BoqLineInput = {
  description: string;
  specification?: string | null;
  /** Kept for the caller's own bookkeeping; never sent to the model. */
  unit: string;
  quantity: number;
};

export type BoqLineTranslated = BoqLineInput & {
  translated_description: string;
  translated_specification: string | null;
};

export type TranslateBoqDirection = "en_to_zh" | "zh_to_en";

export type TranslateBoqInput = {
  lines: BoqLineInput[];
  direction: TranslateBoqDirection;
};

export function validateBoqLines(input: unknown): TranslateBoqInput {
  const value = input as Partial<TranslateBoqInput>;
  if (!value || !Array.isArray(value.lines) || value.lines.length === 0) {
    throw new Error("No BOQ lines to translate.");
  }
  if (value.lines.length > 500) throw new Error("Too many lines in one request — split the BOQ.");
  if (value.direction !== "en_to_zh" && value.direction !== "zh_to_en") {
    throw new Error("Unsupported translation direction.");
  }
  const lines = value.lines.map((l, i) => {
    if (!l || typeof l.description !== "string" || l.description.trim() === "") {
      throw new Error(`Line ${i + 1} has no description.`);
    }
    if (typeof l.unit !== "string" || l.unit.trim() === "") {
      throw new Error(`Line ${i + 1} has no unit.`);
    }
    if (typeof l.quantity !== "number" || !Number.isFinite(l.quantity)) {
      throw new Error(`Line ${i + 1} has no valid quantity.`);
    }
    return {
      description: l.description,
      specification: typeof l.specification === "string" ? l.specification : null,
      unit: l.unit,
      quantity: l.quantity,
    };
  });
  return { lines, direction: value.direction };
}

const BOQ_TOOL = {
  name: "record_translated_lines",
  description: "Return the translation of every line, in the same order, one entry per input line.",
  input_schema: {
    type: "object",
    properties: {
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string", description: "Translated description." },
            specification: {
              type: "string",
              description: "Translated specification. Empty string if the input had none.",
            },
          },
          required: ["description", "specification"],
          additionalProperties: false,
        },
      },
    },
    required: ["lines"],
    additionalProperties: false,
  },
} as const;

/**
 * Translates a whole BOQ line-by-line, in either direction:
 *  - "en_to_zh": UZA's own English BOQ, to send to a Chinese manufacturer.
 *  - "zh_to_en": a manufacturer's submitted Chinese BOQ/quote, for the
 *    founder or QS to review in English.
 *
 * Only `description` and `specification` are ever sent to the model or
 * changed. `unit` and `quantity` are copied straight through from the input
 * on every returned line and never touch the model at all — the same
 * "never invent a number, preserve quantities/units/codes exactly"
 * discipline as `translateMessage`, taken one step further: a number the
 * model never sees is a number it cannot alter. The response is rejected
 * outright (not best-effort padded or truncated) if it does not come back
 * with exactly one translated line per input line, in order — a silent
 * misalignment between line 7's quantity and line 7's translated
 * description would be far worse than a clear error.
 */
export const translateBoqLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateBoqLines)
  .handler(async ({ data }): Promise<{ lines: BoqLineTranslated[] }> => {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new Error("Translation is not configured.");

    const targetName = data.direction === "en_to_zh" ? "Simplified Chinese" : "English";
    const manifest = data.lines.map((l, i) => ({
      line: i + 1,
      description: l.description,
      specification: l.specification ?? "",
    }));

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
          "You translate bills of quantities for construction finishing materials, furniture, joinery, " +
          "doors and stone between English and Chinese. Keep a formal, precise register. Preserve every " +
          "number, unit, dimension, incoterm and product/model code exactly as given — you are only ever " +
          "translating the descriptive words around them. Do not add, remove, merge or reorder lines: " +
          "return exactly one translated line per input line, in the same order. Return an empty string " +
          "for a specification field that was empty in the input.",
        messages: [
          {
            role: "user",
            content: `Translate every "description" and "specification" field into ${targetName}. Return exactly ${manifest.length} line(s), in this order:\n\n${JSON.stringify(manifest)}`,
          },
        ],
        tools: [BOQ_TOOL],
        tool_choice: { type: "tool", name: "record_translated_lines" },
      }),
    });

    if (response.status === 429)
      throw new Error("Translation is busy right now — try again in a moment.");
    if (response.status === 402) throw new Error("Translation credits are exhausted.");
    if (!response.ok) throw new Error("BOQ translation failed.");

    const json = (await response.json()) as {
      content?: { type: string; input?: { lines?: { description?: string; specification?: string }[] } }[];
    };
    const toolUse = json.content?.find((block) => block.type === "tool_use");
    const translatedLines = toolUse?.input?.lines;
    if (!translatedLines || translatedLines.length !== data.lines.length) {
      throw new Error(
        `Translation did not return one line per input line (expected ${data.lines.length}, got ${translatedLines?.length ?? 0}). Nothing was changed — try again.`,
      );
    }

    return {
      lines: data.lines.map((l, i) => ({
        ...l,
        translated_description: (translatedLines[i]?.description ?? "").trim(),
        translated_specification:
          translatedLines[i]?.specification && translatedLines[i]!.specification!.trim() !== ""
            ? translatedLines[i]!.specification!.trim()
            : null,
      })),
    };
  });
