import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Speckle (speckle.systems) integration: gives a UZA Build client a
 * browsable 3D/BIM rendering of their project with comments, without
 * requiring a desktop CAD viewer.
 *
 * PROVENANCE — read this before changing any GraphQL shape below.
 *
 * There is no live Speckle account or SPECKLE_API_TOKEN in this environment,
 * so nothing here has been round-tripped against a real project. What IS
 * verified, and how:
 *
 * 1. Authentication, the GraphQL endpoint shape, and the fact that the REST
 *    API's POST/upload endpoints have been withdrawn from Speckle's own
 *    current docs (in favour of GraphQL) — confirmed by fetching
 *    https://docs.speckle.systems/dev/tokens,
 *    https://docs.speckle.systems/developers/api/graphql and
 *    https://docs.speckle.systems/developers/api/rest directly (2026-09-13).
 *
 * 2. The exact mutation names, input fields and return shapes used below
 *    (projectMutations.create, modelMutations.create, fileUploadMutations.*,
 *    projectMutations.issues.*, the ModelIngestionStatusData union members,
 *    the IssueStatus/IssuePriority enums) — these are NOT documented in
 *    prose anywhere on docs.speckle.systems; Speckle's own docs point
 *    developers at the live schema instead. So they were confirmed the only
 *    way they can be: live, unauthenticated GraphQL introspection against
 *    the real, current production endpoint,
 *    `POST https://app.speckle.systems/graphql` with a `__type(name: "...")`
 *    query for each type named below, run from this sandbox on 2026-09-13.
 *    Introspection needs no token; calling the mutations for real does, and
 *    that part is unverified. If Speckle ships a schema change after this
 *    date, these shapes go stale — re-run the same introspection query
 *    before trusting them again.
 *
 * 3. IMPORTANT, and worth flagging loudly: comments are no longer called
 *    "comments" in Speckle's current schema. A `Comment` type still exists
 *    (kept for backward compatibility) but the project's own `issues` field
 *    plus `projectMutations.issues.*` — a full lightweight issue-tracker
 *    (title, status, priority, assignee, replies, viewer camera state) — is
 *    the live, forward path, confirmed by introspection above. This module
 *    talks to Issues, not the legacy Comment type. If a human sees "Issues"
 *    instead of "Comments" in the Speckle web app, that is expected, not a
 *    bug in this integration.
 *
 * 4. The upload path. This is the one place the task brief specifically
 *    worried about a desktop-connector dead end — it is NOT a dead end.
 *    Speckle has a genuine three-step, fully server-side upload API (no
 *    desktop connector, no browser drag-and-drop required):
 *      a. `fileUploadMutations.generateUploadUrl({projectId, fileName})`
 *         -> a pre-signed PUT url + `fileId`.
 *      b. The caller PUTs the raw file bytes to that url directly (plain
 *         HTTP PUT to blob storage, not a Speckle endpoint).
 *      c. `fileUploadMutations.startFileIngestion({projectId, modelId,
 *         fileId, etag})` registers the upload and starts async conversion,
 *         returning a `ModelIngestion` job to poll.
 *    IFC is a first-class supported upload format (confirmed against
 *    https://docs.speckle.systems/user/ifc.html and the Direct Uploads doc),
 *    alongside DWG/DXF/RVT/SKP/STEP and more. The one genuine limitation:
 *    Speckle's own docs give two different file-size ceilings on the same
 *    page (a "2 GB" info box and a "1000MB for all plans" FAQ answer) —
 *    unresolved on their side, not a typo introduced here. This module uses
 *    the more conservative 1000 MB figure.
 *
 * 5. The embed iframe. docs.speckle.systems/3d-viewer/sharing confirms an
 *    iframe embed is a real, current, supported feature with UI toggles
 *    (transparent background, hide controls, hide selection panel, prevent
 *    scroll zoom, manual load) and that the model must be link-shared (or
 *    loaded with an embed token) for the iframe to render without a login.
 *    The exact query-string Speckle's own "copy embed code" button produces
 *    is generated client-side in their web app and is not published as a
 *    prose spec anywhere Speckle's docs. `speckleEmbedUrl` below is
 *    therefore a best-effort `#embed=true` URL, not a confirmed one — the
 *    `embed_url` column on `drawing_speckle_models` exists specifically so a
 *    human can paste Speckle's own generated embed code over this guess.
 *    (An embed-token mutation, `projectMutations.createEmbedToken`, appeared
 *    once during introspection and was gone on three immediate retries —
 *    consistent with a mid-rollout deploy on Speckle's side. Nothing here
 *    depends on it.)
 */

const DEFAULT_SERVER_URL = "https://app.speckle.systems";
/** Speckle's own docs disagree with themselves (2GB info box vs 1000MB FAQ
 *  answer on the same page); we hold to the smaller, more conservative one. */
const MAX_UPLOAD_BYTES = 1000 * 1024 * 1024;

type Supabase = SupabaseClient<Database>;

function speckleConfig() {
  const serverUrl = (process.env["SPECKLE_SERVER_URL"] || DEFAULT_SERVER_URL).replace(/\/+$/, "");
  const token = process.env["SPECKLE_API_TOKEN"];
  return { serverUrl, token };
}

/** Thrown whenever SPECKLE_API_TOKEN is unset — callers turn this into a
 * "not configured" message rather than a crash, matching this repo's
 * existing pattern for optional AI/integration features. */
class SpeckleNotConfiguredError extends Error {
  constructor() {
    super("3D rendering is not configured yet — ask an admin to connect Speckle.");
  }
}

type GraphQLResponse<T> = { data?: T; errors?: { message: string }[] };

async function speckleGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const { serverUrl, token } = speckleConfig();
  if (!token) throw new SpeckleNotConfiguredError();

  const response = await fetch(`${serverUrl}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Speckle rejected our credentials — the token may be revoked or scoped wrong.");
  }
  if (!response.ok) {
    throw new Error(`Speckle request failed (HTTP ${response.status}).`);
  }

  const json = (await response.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new Error("Speckle returned an empty response.");
  return json.data;
}

/** Best-effort iframe src. See provenance note (5) above — a human should
 * override this with Speckle's own "copy embed code" URL when possible. */
export function speckleEmbedUrl(serverUrl: string, speckleProjectId: string, speckleModelId: string): string {
  return `${serverUrl}/projects/${speckleProjectId}/models/${speckleModelId}#embed=true`;
}

async function requireProjectRow(supabase: Supabase, projectId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That project is not available to you.");
  return data;
}

/**
 * Creates the Speckle project for a UZA Build project on first use, or
 * returns the existing link. Idempotent — safe to call every time a panel
 * mounts.
 */
async function ensureSpeckleProjectLink(supabase: Supabase, projectId: string, userId: string) {
  const existing = await supabase
    .from("project_speckle_projects")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;

  const project = await requireProjectRow(supabase, projectId);
  const { serverUrl } = speckleConfig();

  // Visibility is UNLISTED (Speckle's docs: "Legacy - same as public" — link
  // holders can view without a Speckle login) rather than PRIVATE. The
  // frontend embeds the model in a plain iframe with no confirmed way to
  // inject an auth token into it (see provenance note 5 in this file's
  // header comment), so a PRIVATE project would just show a login wall to
  // every client. This trades project secrecy on Speckle's server for a
  // working embed — acceptable for construction renderings, not for
  // anything commercially sensitive. Revisit if Speckle's createEmbedToken
  // mutation (glimpsed once, unconfirmed) turns out to be stable.
  const created = await speckleGraphQL<{ projectMutations: { create: { id: string } } }>(
    `mutation CreateProject($input: ProjectCreateInput) {
      projectMutations { create(input: $input) { id } }
    }`,
    { input: { name: `UZA Build — ${project.name}`, visibility: "UNLISTED" } },
  );
  const speckleProjectId = created.projectMutations.create.id;

  const { data: inserted, error: insertError } = await supabase
    .from("project_speckle_projects")
    .insert({
      project_id: projectId,
      speckle_server_url: serverUrl,
      speckle_project_id: speckleProjectId,
      created_by: userId,
    })
    .select("*")
    .single();
  if (insertError) throw new Error(insertError.message);
  return inserted;
}

export function validateProjectId(input: unknown): { projectId: string } {
  const value = input as Partial<{ projectId: string }>;
  if (!value || typeof value.projectId !== "string" || value.projectId.length === 0) {
    throw new Error("A project is required.");
  }
  return { projectId: value.projectId };
}

/** Links (or returns the existing link for) a UZA Build project's Speckle
 * project. Call this to render the panel before any drawing is uploaded. */
export const ensureSpeckleProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateProjectId)
  .handler(async ({ data, context }) => {
    try {
      const link = await ensureSpeckleProjectLink(context.supabase, data.projectId, context.userId);
      return { configured: true as const, link };
    } catch (e) {
      if (e instanceof SpeckleNotConfiguredError) {
        return { configured: false as const, link: null };
      }
      throw e;
    }
  });

export function validateDrawingId(input: unknown): { drawingId: string } {
  const value = input as Partial<{ drawingId: string }>;
  if (!value || typeof value.drawingId !== "string" || value.drawingId.length === 0) {
    throw new Error("Select a drawing to send to Speckle.");
  }
  return { drawingId: value.drawingId };
}

/**
 * Sends an already-uploaded UZA Build drawing to Speckle as its own model
 * (one model per drawing, so a client can browse the building floor by
 * floor / zone by zone). Uses the genuine server-side upload API described
 * in provenance note (4): generateUploadUrl -> PUT bytes -> startFileIngestion.
 * Returns immediately once ingestion is queued; conversion happens async on
 * Speckle's side — poll `refreshSpeckleIngestion` for completion.
 */
export const sendDrawingToSpeckle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateDrawingId)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { serverUrl } = speckleConfig();
    if (!process.env["SPECKLE_API_TOKEN"]) throw new SpeckleNotConfiguredError();

    const { data: drawing, error } = await supabase
      .from("drawings")
      .select("id, project_id, file_name, storage_path, size_bytes")
      .eq("id", data.drawingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!drawing) throw new Error("That drawing is not available to you.");

    if (drawing.size_bytes && Number(drawing.size_bytes) > MAX_UPLOAD_BYTES) {
      throw new Error("This file is larger than Speckle's upload limit (1000 MB).");
    }

    const projectLink = await ensureSpeckleProjectLink(supabase, drawing.project_id, userId);

    // One Speckle model per drawing: reuse it across re-uploads (a re-upload
    // becomes a new version of the same model) instead of creating a new one
    // every time.
    const modelRow = await supabase
      .from("drawing_speckle_models")
      .select("*")
      .eq("drawing_id", drawing.id)
      .maybeSingle();
    if (modelRow.error) throw new Error(modelRow.error.message);

    let speckleModelId = modelRow.data?.speckle_model_id;
    if (!speckleModelId) {
      const createdModel = await speckleGraphQL<{ modelMutations: { create: { id: string } } }>(
        `mutation CreateModel($input: CreateModelInput!) {
          modelMutations { create(input: $input) { id } }
        }`,
        { input: { projectId: projectLink.speckle_project_id, name: drawing.file_name } },
      );
      speckleModelId = createdModel.modelMutations.create.id;
    }

    const file = await supabase.storage.from("drawings").download(drawing.storage_path);
    if (file.error || !file.data) throw new Error("The stored file could not be opened.");
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error("This file is larger than Speckle's upload limit (1000 MB).");
    }

    // Step a: ask Speckle for a pre-signed upload url.
    const uploadUrlResult = await speckleGraphQL<{
      fileUploadMutations: {
        generateUploadUrl: { url: string; fileId: string; additionalRequestHeaders: string[] };
      };
    }>(
      `mutation GenerateUploadUrl($input: GenerateFileUploadUrlInput!) {
        fileUploadMutations {
          generateUploadUrl(input: $input) { url fileId additionalRequestHeaders }
        }
      }`,
      { input: { projectId: projectLink.speckle_project_id, fileName: drawing.file_name } },
    );
    const { url, fileId, additionalRequestHeaders } = uploadUrlResult.fileUploadMutations.generateUploadUrl;

    // Step b: PUT the raw bytes straight to blob storage — not a Speckle
    // endpoint. additionalRequestHeaders' exact runtime shape (array of
    // {header,value} vs ["Header: value"] strings) is unconfirmed — the
    // schema only names it a `[String]`-shaped list without documenting the
    // encoding, and this has never been round-tripped against a live PUT.
    const headers: Record<string, string> = {};
    for (const entry of additionalRequestHeaders ?? []) {
      const [key, ...rest] = String(entry).split(":");
      if (key && rest.length > 0) headers[key.trim()] = rest.join(":").trim();
    }
    const putResponse = await fetch(url, { method: "PUT", headers, body: bytes });
    if (!putResponse.ok) {
      throw new Error(`Uploading to Speckle's storage failed (HTTP ${putResponse.status}).`);
    }
    const etag = (putResponse.headers.get("etag") ?? "").replace(/"/g, "");
    if (!etag) throw new Error("Speckle's storage did not return an ETag to confirm the upload.");

    // Step c: register the completed upload and start conversion.
    const ingestion = await speckleGraphQL<{
      fileUploadMutations: { startFileIngestion: { id: string } };
    }>(
      `mutation StartFileIngestion($input: StartFileImportInput!) {
        fileUploadMutations { startFileIngestion(input: $input) { id } }
      }`,
      {
        input: {
          projectId: projectLink.speckle_project_id,
          modelId: speckleModelId,
          fileId,
          etag,
        },
      },
    );
    const ingestionId = ingestion.fileUploadMutations.startFileIngestion.id;

    const embedUrl = speckleEmbedUrl(serverUrl, projectLink.speckle_project_id, speckleModelId);
    const { data: saved, error: upsertError } = await supabase
      .from("drawing_speckle_models")
      .upsert(
        {
          project_id: drawing.project_id,
          drawing_id: drawing.id,
          speckle_model_id: speckleModelId,
          speckle_model_name: drawing.file_name,
          latest_file_id: fileId,
          latest_ingestion_id: ingestionId,
          ingestion_status: "pending",
          ingestion_error: null,
          embed_url: modelRow.data?.embed_url ?? embedUrl,
          created_by: userId,
        },
        { onConflict: "drawing_id" },
      )
      .select("*")
      .single();
    if (upsertError) throw new Error(upsertError.message);
    return saved;
  });

/**
 * Polls Speckle for the current state of a drawing's most recent ingestion
 * job and mirrors it onto `drawing_speckle_models`. Cheap to call on an
 * interval from the panel while status is "pending".
 */
export const refreshSpeckleIngestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateDrawingId)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!process.env["SPECKLE_API_TOKEN"]) throw new SpeckleNotConfiguredError();

    const { data: row, error } = await supabase
      .from("drawing_speckle_models")
      .select("*")
      .eq("drawing_id", data.drawingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("This drawing has not been sent to Speckle yet.");
    if (!row.latest_ingestion_id || row.ingestion_status !== "pending") return row;

    const result = await speckleGraphQL<{
      project: {
        model: {
          latestIngestion: {
            id: string;
            statusData:
              | { __typename: "ModelIngestionSuccessStatus"; versionId: string }
              | { __typename: "ModelIngestionFailedStatus"; errorReason: string }
              | { __typename: "ModelIngestionCancelledStatus"; cancellationMessage: string }
              | { __typename: "ModelIngestionInvalidStatus"; validationMessage: string }
              | { __typename: "ModelIngestionQueuedStatus" }
              | { __typename: "ModelIngestionProcessingStatus" };
          } | null;
        };
      };
    }>(
      `query IngestionStatus($projectId: String!, $modelId: String!) {
        project(id: $projectId) {
          model(id: $modelId) {
            latestIngestion {
              id
              statusData {
                __typename
                ... on ModelIngestionSuccessStatus { versionId }
                ... on ModelIngestionFailedStatus { errorReason }
                ... on ModelIngestionCancelledStatus { cancellationMessage }
                ... on ModelIngestionInvalidStatus { validationMessage }
              }
            }
          }
        }
      }`,
      { projectId: row.project_id, modelId: row.speckle_model_id },
    );

    const ingestion = result.project.model.latestIngestion;
    if (!ingestion || ingestion.id !== row.latest_ingestion_id) return row;

    const status = ingestion.statusData;
    let update: Partial<Database["public"]["Tables"]["drawing_speckle_models"]["Update"]> | null = null;
    if (status.__typename === "ModelIngestionSuccessStatus") {
      update = { ingestion_status: "success", latest_version_id: status.versionId, ingestion_error: null };
    } else if (status.__typename === "ModelIngestionFailedStatus") {
      update = { ingestion_status: "error", ingestion_error: status.errorReason };
    } else if (status.__typename === "ModelIngestionCancelledStatus") {
      update = { ingestion_status: "error", ingestion_error: status.cancellationMessage };
    } else if (status.__typename === "ModelIngestionInvalidStatus") {
      update = { ingestion_status: "error", ingestion_error: status.validationMessage };
    }
    if (!update) return row; // still queued/processing — nothing to persist yet

    const { data: saved, error: updateError } = await supabase
      .from("drawing_speckle_models")
      .update(update)
      .eq("id", row.id)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);
    return saved;
  });

export type SpeckleIssue = {
  id: string;
  title: string | null;
  status: string;
  priority: string;
  rawDescription: string | null;
  authorName: string | null;
  createdAt: string;
  replyCount: number;
};

/** Lists the Issues (Speckle's current name for model comments/markups —
 * see provenance note 3) attached to a drawing's model. */
export const listSpeckleIssues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateDrawingId)
  .handler(async ({ data, context }): Promise<{ issues: SpeckleIssue[] }> => {
    const { supabase } = context;
    if (!process.env["SPECKLE_API_TOKEN"]) throw new SpeckleNotConfiguredError();

    const { data: row, error } = await supabase
      .from("drawing_speckle_models")
      .select("project_id, speckle_model_id")
      .eq("drawing_id", data.drawingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { issues: [] };

    const link = await supabase
      .from("project_speckle_projects")
      .select("speckle_project_id")
      .eq("project_id", row.project_id)
      .maybeSingle();
    if (link.error) throw new Error(link.error.message);
    if (!link.data) return { issues: [] };

    const result = await speckleGraphQL<{
      project: {
        issues: {
          items: {
            id: string;
            title: string | null;
            status: string;
            priority: string;
            rawDescription: string | null;
            createdAt: string;
            author: { user: { name: string } } | null;
            replies: { totalCount: number };
          }[];
        };
      };
    }>(
      `query ModelIssues($projectId: String!, $input: ProjectIssuesInput) {
        project(id: $projectId) {
          issues(input: $input) {
            items {
              id
              title
              status
              priority
              rawDescription
              createdAt
              author { user { name } }
              replies { totalCount }
            }
          }
        }
      }`,
      { projectId: link.data.speckle_project_id, input: { resourceIdString: row.speckle_model_id, limit: 50 } },
    );

    return {
      issues: result.project.issues.items.map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        priority: i.priority,
        rawDescription: i.rawDescription,
        authorName: i.author?.user?.name ?? null,
        createdAt: i.createdAt,
        replyCount: i.replies.totalCount,
      })),
    };
  });

export function validatePostIssue(input: unknown): { drawingId: string; title: string; body: string } {
  const value = input as Partial<{ drawingId: string; title: string; body: string }>;
  if (!value || typeof value.drawingId !== "string" || value.drawingId.length === 0) {
    throw new Error("Select a drawing first.");
  }
  if (typeof value.title !== "string" || value.title.trim().length === 0) {
    throw new Error("Give the comment a short title.");
  }
  return { drawingId: value.drawingId, title: value.title.slice(0, 200), body: (value.body ?? "").slice(0, 4000) };
}

/** Posts a new Issue (comment/markup) against a drawing's Speckle model,
 * attached to the whole model rather than a specific 3D point — Speckle's
 * per-point pin comes from `viewerState`, which only the web viewer itself
 * can capture (the camera + selection at click time), so it is left unset
 * here (see the frontend panel for the fuller note). */
export const postSpeckleIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validatePostIssue)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!process.env["SPECKLE_API_TOKEN"]) throw new SpeckleNotConfiguredError();

    const { data: row, error } = await supabase
      .from("drawing_speckle_models")
      .select("project_id, speckle_model_id")
      .eq("drawing_id", data.drawingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Send this drawing to Speckle before commenting on it.");

    const link = await supabase
      .from("project_speckle_projects")
      .select("speckle_project_id")
      .eq("project_id", row.project_id)
      .maybeSingle();
    if (link.error) throw new Error(link.error.message);
    if (!link.data) throw new Error("This project has no linked Speckle project.");

    const result = await speckleGraphQL<{ projectMutations: { issues: { createIssue: { id: string } } } }>(
      `mutation CreateIssue($input: CreateIssueInput!) {
        projectMutations { issues { createIssue(input: $input) { id } } }
      }`,
      {
        input: {
          projectId: link.data.speckle_project_id,
          resourceIdString: row.speckle_model_id,
          title: data.title,
          description: data.body
            ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: data.body }] }] }
            : undefined,
        },
      },
    );
    return { issueId: result.projectMutations.issues.createIssue.id };
  });
