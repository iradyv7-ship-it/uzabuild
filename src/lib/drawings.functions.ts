import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readAnyDrawing } from "@/lib/drawing-reader.server";

/** 18 MB of source file — beyond this the model call is not reliable. */
const MAX_BYTES = 18 * 1024 * 1024;

function validate(input: unknown): { drawingId: string } {
  const value = input as Partial<{ drawingId: string }>;
  if (!value || typeof value.drawingId !== "string" || value.drawingId.length === 0) {
    throw new Error("Select a drawing to read.");
  }
  return { drawingId: value.drawingId };
}

const TOOL = {
  type: "function",
  function: {
    name: "record_takeoff",
    description: "Record every measurable space and opening visible on this drawing.",
    parameters: {
      type: "object",
      properties: {
        scale_note: {
          type: "string",
          description:
            "The drawing scale or dimension basis you used, quoted from the drawing. Empty string if none is printed.",
        },
        spaces: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Room or space name as labelled on the drawing",
              },
              level: {
                type: "string",
                description: "Floor or level label. Empty string if not shown.",
              },
              floor_area_m2: {
                type: "number",
                description: "Floor area in square metres. 0 if not derivable.",
              },
              wall_area_m2: {
                type: "number",
                description: "Net wall area in square metres. 0 if not derivable.",
              },
              perimeter_m: {
                type: "number",
                description: "Perimeter in metres. 0 if not derivable.",
              },
              door_count: { type: "number" },
              window_count: { type: "number" },
              opening_area_m2: {
                type: "number",
                description:
                  "Combined door and window area deducted from the walls. 0 if not derivable.",
              },
              confidence: {
                type: "number",
                description: "0 to 1. How sure you are of these figures.",
              },
              basis: {
                type: "string",
                description:
                  "The dimensions or scale you read off the drawing to arrive at these figures.",
              },
            },
            required: [
              "name",
              "level",
              "floor_area_m2",
              "wall_area_m2",
              "perimeter_m",
              "door_count",
              "window_count",
              "opening_area_m2",
              "confidence",
              "basis",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["scale_note", "spaces"],
      additionalProperties: false,
    },
  },
} as const;

type Space = {
  name: string;
  level: string;
  floor_area_m2: number;
  wall_area_m2: number;
  perimeter_m: number;
  door_count: number;
  window_count: number;
  opening_area_m2: number;
  confidence: number;
  basis: string;
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Reads an uploaded PDF or image drawing with a vision model and files the
 * result as DRAFT takeoff lines — each one carrying its confidence, the
 * dimensions the model claims to have read, and the drawing it came from.
 * Nothing here is a measurement until a quantity surveyor confirms it.
 */
export const readDrawing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Drawing reading is not configured.");

    const { data: drawing, error } = await context.supabase
      .from("drawings")
      .select("id, project_id, file_name, file_type, storage_path, size_bytes")
      .eq("id", data.drawingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!drawing) throw new Error("That drawing is not available to you.");

    if (drawing.size_bytes && Number(drawing.size_bytes) > MAX_BYTES) {
      throw new Error("This file is too large to read automatically — a surveyor must measure it.");
    }

    await context.supabase
      .from("drawings")
      .update({ status: "processing", error: null })
      .eq("id", drawing.id);

    const fail = async (message: string, reason: string) => {
      await context.supabase
        .from("drawings")
        .update({
          status: "failed",
          error: message,
          requires_human_takeoff: true,
          human_takeoff_reason: reason,
        })
        .eq("id", drawing.id);
      throw new Error(message);
    };

    const file = await context.supabase.storage.from("drawings").download(drawing.storage_path);
    if (file.error || !file.data) {
      return fail(
        "The stored file could not be opened.",
        "The stored file could not be opened for automatic reading.",
      );
    }

    const bytes = new Uint8Array(await file.data.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) {
      return fail(
        "This file is too large to read automatically.",
        "File too large for the automatic reader — measure by hand.",
      );
    }

    // Format-aware parsing step: native PDFs/images go to the vision model as
    // a file part unchanged; DXF/IFC/STEP are parsed into a structured digest;
    // proprietary CAD/BIM binaries (DWG, RVT, RFA, SKP, NWD) get their layer,
    // room and schedule labels salvaged rather than being rejected outright.
    // Either way the model sees SOMETHING and every draft still needs a QS.
    const source = readAnyDrawing({ bytes, fileName: drawing.file_name, mimeType: drawing.file_type });
    if (source.mode === "text" && !source.text?.trim()) {
      return fail(
        "Nothing readable could be recovered from this file.",
        "The universal drawing reader found no recoverable layers, labels or text in this file — a surveyor must measure it.",
      );
    }

    const userContent =
      source.mode === "file"
        ? [
            {
              type: "text" as const,
              text: `Drawing file: ${drawing.file_name}. Record every labelled space and its openings.`,
            },
            {
              type: "image_url" as const,
              image_url: { url: `data:${source.mimeType};base64,${toBase64(source.bytes!)}` },
            },
          ]
        : [
            {
              type: "text" as const,
              text:
                `Drawing file: ${drawing.file_name} — a CAD/BIM format that cannot be rendered as an image, so this ` +
                `is a text digest recovered from it (${source.method}). Work only from labelled spaces, room names and ` +
                `schedule text present in the digest; if the digest carries no scale or dimension, return 0 for that ` +
                `figure and lower your confidence rather than guessing.\n\n${source.text}`,
            },
          ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5.6-sol",
        reasoning_effort: "none",
        messages: [
          {
            role: "system",
            content:
              "You are a quantity surveyor reading an architectural drawing. Work only from what is printed: room labels, " +
              "dimension strings, door and window schedules and the stated scale. Derive floor area, net wall area, " +
              "perimeter and opening areas in metric units. If a figure cannot be derived from the drawing, return 0 " +
              "rather than estimating it, and lower your confidence. Never invent a room that is not labelled.",
          },
          {
            role: "user",
            content: userContent,
          },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "record_takeoff" } },
      }),
    });

    if (response.status === 429)
      throw new Error("The drawing reader is busy right now — try again in a moment.");
    if (response.status === 402) throw new Error("AI credits are exhausted.");
    if (!response.ok) {
      return fail(
        "The drawing reader could not process this file.",
        "The automatic reader could not process this file — measure by hand.",
      );
    }

    const json = (await response.json()) as {
      choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      return fail(
        "Nothing measurable was found on this drawing.",
        "No labelled, dimensioned spaces were found — a surveyor must measure this drawing.",
      );
    }

    const parsed = JSON.parse(args) as { scale_note?: string; spaces?: Space[] };
    const spaces = (parsed.spaces ?? []).filter(
      (s) => typeof s.name === "string" && s.name.trim() !== "",
    );
    if (spaces.length === 0) {
      return fail(
        "Nothing measurable was found on this drawing.",
        "No labelled, dimensioned spaces were found — a surveyor must measure this drawing.",
      );
    }

    const scaleNote = (parsed.scale_note ?? "").trim();
    const aiSource = `AI read of ${drawing.file_name} (${source.method})${scaleNote ? ` · scale basis: ${scaleNote}` : " · no printed scale"}`;
    const clamp = (n: unknown) => (Number.isFinite(n) && Number(n) > 0 ? Number(n) : 0);
    const confidenceOf = (s: Space) => {
      const raw = Number(s.confidence);
      const base = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.4;
      // No printed scale means no trustworthy dimension, whatever the model claims.
      // A degraded (salvaged/parsed-digest) read is capped the same way: it is
      // provenance, not a measured sheet, however confident the model sounds.
      const capped = scaleNote ? base : Math.min(base, 0.4);
      return source.degraded ? Math.min(capped, 0.5) : capped;
    };

    const rows: {
      project_id: string;
      drawing_id: string;
      description: string;
      unit: string;
      measurement_method: string;
      material_category: string;
      ai_quantity: number;
      ai_confidence: number;
      ai_source: string;
      ai_rationale: string;
      status: string;
      sort_order: number;
    }[] = [];

    let order = 0;
    for (const s of spaces) {
      const where = [s.level.trim(), s.name.trim()].filter(Boolean).join(" · ");
      const rationale = s.basis?.trim() || "The model gave no dimension basis for this figure.";
      const add = (
        label: string,
        unit: string,
        method: string,
        category: string,
        quantity: number,
        confidence: number,
      ) => {
        if (quantity <= 0) return;
        rows.push({
          project_id: drawing.project_id,
          drawing_id: drawing.id,
          description: `${where} — ${label}`,
          unit,
          measurement_method: method,
          material_category: category,
          ai_quantity: quantity,
          ai_confidence: confidence,
          ai_source: aiSource,
          ai_rationale: rationale,
          status: "draft",
          sort_order: order++,
        });
      };

      const c = confidenceOf(s);
      add("floor area", "m2", "area", "floor", clamp(s.floor_area_m2), c);
      add("wall area (net of openings)", "m2", "area", "wall", clamp(s.wall_area_m2), c);
      add("perimeter", "m", "length", "skirting", clamp(s.perimeter_m), c);
      add("doors", "no", "count", "door", clamp(s.door_count), c);
      add("windows", "no", "count", "window", clamp(s.window_count), c);
      add("opening area deducted", "m2", "area", "opening", clamp(s.opening_area_m2), c);
    }

    if (rows.length === 0) {
      return fail(
        "The drawing was read but no dimension could be derived from it.",
        "The drawing carries no usable dimensions — a surveyor must measure it.",
      );
    }

    const { error: insertError } = await context.supabase.from("takeoff_lines").insert(rows);
    if (insertError) throw new Error(insertError.message);

    // A salvaged/parsed CAD-BIM digest always goes back to a human, on top of
    // the existing no-printed-scale rule — it is provenance recovered from a
    // container, never a measured sheet.
    const needsHuman = !scaleNote || source.degraded;
    await context.supabase
      .from("drawings")
      .update({
        status: "extracted",
        error: null,
        extraction: {
          scale_note: scaleNote,
          spaces,
          read_at: new Date().toISOString(),
          read_method: source.method,
          degraded: source.degraded,
        },
        read_method: source.method,
        degraded: source.degraded,
        requires_human_takeoff: needsHuman,
        human_takeoff_reason: needsHuman
          ? source.degraded
            ? `Read via ${source.method} — a salvaged/parsed digest, not a measured sheet. A surveyor must confirm every quantity against the real drawing.`
            : "No printed scale was found, so every quantity read from this drawing must be confirmed against real dimensions."
          : null,
      })
      .eq("id", drawing.id);

    return { spaces: spaces.length, lines: rows.length, scaleNote, needsHuman, method: source.method, degraded: source.degraded };
  });
