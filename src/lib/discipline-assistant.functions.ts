import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readAnyDrawing } from "@/lib/drawing-reader.server";
import { roleLabel, type AppRole } from "@/constants/roles";

/**
 * One assistant per discipline seat — architect, QS, interior designer, MEP
 * engineer — that reads the project's documents the way that specialist
 * would, and answers their question from them.
 *
 * It sees exactly what the person asking can see and nothing more: every
 * document, note and proposal is read through the caller's own RLS-scoped
 * Supabase client, so a client submission reaches the assistant only once a
 * project lead has granted it to that seat or that person
 * (document_access_grants, 20261009120000). The assistant has no authority:
 * it never writes a quantity, a status or an approval.
 */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
/** Server-side refusal fallback: a declined request is re-run on a fallback model in the same call. */
const ANTHROPIC_BETA = "server-side-fallback-2026-07-01";
const MODEL = "claude-opus-5-5";
const MAX_TOKENS = 16000;

/** Files attached to one question, newest first; text digests do not count. */
const MAX_FILES = 6;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Base64 grows ~33%; the API caps a request at 32 MB. */
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export const ASSISTANT_DISCIPLINES = [
  "architect",
  "qs",
  "interior_designer",
  "mep_engineer",
] as const;
export type AssistantDiscipline = (typeof ASSISTANT_DISCIPLINES)[number];

const BRIEFS: Record<AssistantDiscipline, string> = {
  architect:
    "You assist the project architect. Read the drawings for spaces, room names, areas, levels, " +
    "openings, circulation and what each sheet actually states versus what is assumed. Flag " +
    "inconsistencies between sheets or revisions, missing dimensions, and anything that needs the " +
    "client to clarify.",
  qs:
    "You assist the quantity surveyor. Read the drawings and schedules for what can be measured — " +
    "areas, lengths, counts, openings — and say how you would measure each item (area, length, " +
    "count, volume) and what wastage or rounding it needs. Never present a figure the documents do " +
    "not support as measured; mark estimates as estimates and say what is missing to measure properly.",
  interior_designer:
    "You assist the interior designer. Read the drawings and the client's design-board proposals for " +
    "finishes per room — floor, wall, ceiling, sanitary, lighting, joinery, colour. Say which " +
    "proposals fit the space and use, which do not and why (wet areas, traffic, light, scale), and " +
    "suggest how to customise what the client asked for.",
  mep_engineer:
    "You assist the MEP / structural engineer. Read the drawings for electrical points, lighting, " +
    "plumbing and drainage, HVAC, structure and roof area for solar. List the loads, points and runs " +
    "the documents show, what they leave out, and the questions to resolve before sizing.",
};

type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | {
      type: "document";
      source: { type: "base64"; media_type: "application/pdf"; data: string };
      title?: string;
    };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function askClaude(system: string, content: Block[]): Promise<string> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("This assistant is not configured.");

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
      output_config: { effort: "high" },
      system,
      messages: [{ role: "user", content }],
    }),
  });

  if (response.status === 429)
    throw new Error("This assistant is busy right now — try again in a moment.");
  if (response.status === 402) throw new Error("AI credits are exhausted.");
  if (response.status === 413)
    throw new Error("Those documents are too large to read in one question.");
  if (!response.ok) throw new Error("The assistant could not answer that.");

  const json = (await response.json()) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
  };
  if (json.stop_reason === "refusal")
    throw new Error("The assistant declined to answer that question.");
  const answer = (json.content ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n\n")
    .trim();
  if (!answer) throw new Error("The assistant returned nothing.");
  return answer;
}

function validate(input: unknown): {
  projectId: string;
  discipline: AssistantDiscipline;
  question: string;
  drawingIds: string[] | null;
} {
  const v = input as Partial<{
    projectId: string;
    discipline: string;
    question: string;
    drawingIds: unknown;
  }>;
  if (typeof v?.projectId !== "string" || !v.projectId) throw new Error("Select a project first.");
  if (!ASSISTANT_DISCIPLINES.includes(v?.discipline as AssistantDiscipline))
    throw new Error("Choose which specialist's assistant to ask.");
  if (typeof v?.question !== "string" || !v.question.trim())
    throw new Error("Ask a question first.");
  const drawingIds = Array.isArray(v.drawingIds)
    ? v.drawingIds.filter((x): x is string => typeof x === "string").slice(0, 50)
    : null;
  return {
    projectId: v.projectId,
    discipline: v.discipline as AssistantDiscipline,
    question: v.question.trim().slice(0, 4000),
    drawingIds: drawingIds && drawingIds.length > 0 ? drawingIds : null,
  };
}

export const disciplineAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    // The caller must hold the seat whose assistant they are asking (or be admin).
    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rolesError) throw new Error(rolesError.message);
    const held = new Set((roles ?? []).map((r) => r.role as AppRole));
    if (!held.has(data.discipline) && !held.has("admin")) {
      throw new Error(`Only a ${roleLabel(data.discipline)} can use this assistant.`);
    }

    const { data: project, error: projectError } = await context.supabase
      .from("projects")
      .select("id, name, client_name, location, current_stage")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found, or you cannot access it.");

    // RLS returns only the documents this person may read.
    let docsQuery = context.supabase
      .from("drawings")
      .select(
        "id, file_name, file_type, storage_path, size_bytes, submitted_by_client, review_status, client_note, extraction, created_at",
      )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(60);
    if (data.drawingIds) docsQuery = docsQuery.in("id", data.drawingIds);
    const { data: docs, error: docsError } = await docsQuery;
    if (docsError) throw new Error(docsError.message);

    if (!docs || docs.length === 0) {
      return {
        answer:
          "I have no documents on this project that you have access to. If the client has sent drawings, " +
          "ask a project lead to grant them to your seat, then ask me again.",
        documentsRead: [] as string[],
        documentsListed: 0,
      };
    }

    const { data: selections } = await context.supabase
      .from("client_selections")
      .select(
        "kind, title, area_label, colour_hex, notes, status, team_response, alternative_title, room_id",
      )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true })
      .limit(100);

    const { data: rooms } = await context.supabase
      .from("rooms")
      .select("id, name, room_type, floor_area_m2, wall_area_m2, perimeter_m, ceiling_height_m")
      .eq("project_id", data.projectId)
      .limit(200);
    const roomName = new Map((rooms ?? []).map((r) => [r.id, r.name]));

    const content: Block[] = [];
    const read: string[] = [];
    const listedOnly: string[] = [];
    let total = 0;

    for (const d of docs) {
      const size = Number(d.size_bytes ?? 0);
      if (read.length >= MAX_FILES || size > MAX_FILE_BYTES || total + size > MAX_TOTAL_BYTES) {
        listedOnly.push(d.file_name);
        continue;
      }
      const file = await context.supabase.storage.from("drawings").download(d.storage_path);
      if (file.error || !file.data) {
        listedOnly.push(d.file_name);
        continue;
      }
      const bytes = new Uint8Array(await file.data.arrayBuffer());
      if (bytes.byteLength > MAX_FILE_BYTES || total + bytes.byteLength > MAX_TOTAL_BYTES) {
        listedOnly.push(d.file_name);
        continue;
      }
      const source = readAnyDrawing({ bytes, fileName: d.file_name, mimeType: d.file_type });
      const label =
        `Document: ${d.file_name}` +
        (d.submitted_by_client ? " (submitted by the client)" : "") +
        (d.client_note ? ` — client's note: "${d.client_note}"` : "");
      if (source.mode === "file" && source.bytes && source.mimeType) {
        content.push({ type: "text", text: label });
        if (source.mimeType === "application/pdf") {
          content.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: toBase64(source.bytes) },
            title: d.file_name,
          });
        } else {
          content.push({
            type: "image",
            source: { type: "base64", media_type: source.mimeType, data: toBase64(source.bytes) },
          });
        }
        total += bytes.byteLength;
      } else if (source.text?.trim()) {
        content.push({
          type: "text",
          text: `${label}\n[${source.method}; a lossy digest, not the drawing itself]\n${source.text}`,
        });
      } else {
        listedOnly.push(d.file_name);
        continue;
      }
      read.push(d.file_name);
    }

    const extractionNotes = docs
      .filter((d) => d.extraction)
      .slice(0, 10)
      .map((d) => `- ${d.file_name}: ${JSON.stringify(d.extraction).slice(0, 3000)}`)
      .join("\n");

    const boardText = (selections ?? [])
      .map(
        (s) =>
          `- [${s.status}] ${s.kind}: ${s.title}` +
          (s.room_id && roomName.get(s.room_id)
            ? ` (room: ${roomName.get(s.room_id)})`
            : s.area_label
              ? ` (${s.area_label})`
              : "") +
          (s.colour_hex ? ` colour ${s.colour_hex}` : "") +
          (s.notes ? ` — client: "${s.notes}"` : "") +
          (s.team_response ? ` — team: "${s.team_response}"` : "") +
          (s.alternative_title ? ` — proposed instead: ${s.alternative_title}` : ""),
      )
      .join("\n");

    const roomsText = (rooms ?? [])
      .map(
        (r) =>
          `- ${r.name}${r.room_type ? ` (${r.room_type})` : ""}: floor ${r.floor_area_m2} m², walls ${r.wall_area_m2} m², ` +
          `perimeter ${r.perimeter_m} m, ceiling ${r.ceiling_height_m} m`,
      )
      .join("\n");

    const system =
      "You work inside UZA Build, a construction design, take-off and BOQ platform in Rwanda. " +
      BRIEFS[data.discipline] +
      "\n\nGround every statement in the documents and records provided. Cite the document name for " +
      "anything you read from a drawing. When a document does not show something, say so instead of " +
      "assuming it. You advise; a named professional decides — never present your reading as an " +
      "approved quantity, specification or sign-off. Do not mention prices, suppliers or factories: " +
      "this assistant does not see costs.\n\n" +
      `Project: ${project.name}` +
      (project.client_name ? ` for ${project.client_name}` : "") +
      (project.location ? `, ${project.location}` : "") +
      `. Current stage: ${project.current_stage}.\n` +
      (listedOnly.length
        ? `Documents you can access but that are not attached to this question (too large or too many): ${listedOnly.join(", ")}.\n`
        : "") +
      (roomsText ? `\nRooms recorded so far:\n${roomsText}\n` : "") +
      (boardText
        ? `\nThe client's design-board proposals and the team's answers:\n${boardText}\n`
        : "") +
      (extractionNotes
        ? `\nEarlier automatic drawing reads (drafts, unconfirmed):\n${extractionNotes}\n`
        : "");

    content.push({ type: "text", text: data.question });

    const answer = await askClaude(system, content);
    return { answer, documentsRead: read, documentsListed: docs.length };
  });
