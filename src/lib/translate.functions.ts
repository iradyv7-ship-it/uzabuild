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
