/**
 * The client workspace: technical drawings a client submits, the work the team
 * records against them, who may read them, and the design board where the
 * client proposes finishes and the team answers.
 *
 * Every rule here is enforced by the database (20261009120000) — a client
 * submission is restricted until a project lead grants it to a discipline seat
 * or a named person, a client never sees a catalog price or an internal-only
 * update, and neither side can write the other's half of a proposal. These
 * functions only keep the queries in one place.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/constants/roles";

const BUCKET = "drawings";

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export const REVIEW_STATUSES = [
  "received",
  "in_review",
  "in_progress",
  "needs_revision",
  "accepted",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  received: "Received",
  in_review: "Being reviewed",
  in_progress: "Work in progress",
  needs_revision: "Needs a revision from you",
  accepted: "Accepted",
};

export function reviewStatusLabel(status: string | null | undefined): string {
  return status ? (REVIEW_STATUS_LABELS[status as ReviewStatus] ?? status) : "—";
}

/** Formats a client may submit: drawings, models, scans and written briefs. */
export const CLIENT_UPLOAD_ACCEPT =
  ".pdf,.dwg,.dxf,.ifc,.rvt,.skp,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.docx,.doc";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export type ClientDocument = {
  id: string;
  file_name: string;
  document_kind: string;
  storage_path: string;
  submitted_by_client: boolean;
  review_status: string | null;
  client_note: string | null;
  client_visible: boolean;
  created_at: string;
};

/**
 * Everything the client can see on a project: what they submitted, and what
 * UZA released to them. The database returns nothing else to a client seat.
 */
export async function listClientDocuments(projectId: string): Promise<ClientDocument[]> {
  const { data, error } = await supabase
    .from("drawings")
    .select(
      "id, file_name, document_kind, storage_path, submitted_by_client, review_status, client_note, client_visible, created_at",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * A client submits technical drawings. The database marks each one as a
 * restricted client submission with status "received" and logs it on the
 * timeline — none of that is trusted from this call.
 */
export async function submitClientDrawings(input: {
  projectId: string;
  files: File[];
  note?: string | undefined;
  userId?: string | null | undefined;
}) {
  for (const file of input.files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(
        `${file.name} is larger than 100 MB. Split it or send a link to your UZA contact.`,
      );
    }
    const ext = extensionOf(file.name);
    const path = `${input.projectId}/client/${crypto.randomUUID()}.${ext}`;
    const { error: storageError } = await supabase.storage.from(BUCKET).upload(path, file);
    if (storageError) throw storageError;

    const { error } = await supabase.from("drawings").insert({
      project_id: input.projectId,
      file_name: file.name,
      storage_path: path,
      file_type: file.type || ext,
      size_bytes: file.size,
      status: "pending",
      requires_human_takeoff: true,
      human_takeoff_reason:
        "Submitted by the client — a project lead routes it before anyone measures it.",
      document_kind: ["doc", "docx", "xlsx", "xls", "csv"].includes(ext) ? "document" : "drawing",
      client_note: input.note?.trim() || null,
      uploaded_by: input.userId ?? null,
    });
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw error;
    }
  }
}

/** A client withdraws a submission nobody has started on yet. */
export async function withdrawClientDrawing(doc: Pick<ClientDocument, "id" | "storage_path">) {
  const { error } = await supabase.from("drawings").delete().eq("id", doc.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([doc.storage_path]);
}

export async function getFileUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error || !data) throw error ?? new Error("Could not open that file.");
  return data.signedUrl;
}

export async function openFile(storagePath: string, name: string) {
  const url = await getFileUrl(storagePath);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.target = "_blank";
  a.rel = "noopener";
  a.click();
}

/* ------------------------------------------------------------------ */
/* Timeline of work on a document                                      */
/* ------------------------------------------------------------------ */

export type DocumentActivity = {
  id: string;
  drawing_id: string;
  actor_name: string | null;
  kind: string;
  status: string | null;
  body: string | null;
  client_visible: boolean;
  created_at: string;
};

export async function listDocumentActivity(projectId: string): Promise<DocumentActivity[]> {
  const { data, error } = await supabase
    .from("document_activity")
    .select("id, drawing_id, actor_name, kind, status, body, client_visible, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * A team member records progress ("update"), or anyone comments. Internal
 * updates can be kept off the client's timeline with `clientVisible: false`.
 */
export async function postDocumentActivity(input: {
  drawingId: string;
  projectId: string;
  kind: "update" | "comment";
  body: string;
  clientVisible?: boolean;
}) {
  const body = input.body.trim();
  if (!body) throw new Error("Write something first.");
  const { error } = await supabase.from("document_activity").insert({
    drawing_id: input.drawingId,
    project_id: input.projectId,
    kind: input.kind,
    body: body.slice(0, 4000),
    client_visible: input.clientVisible ?? true,
  });
  if (error) throw error;
}

export async function setReviewStatus(drawingId: string, status: ReviewStatus) {
  const { error } = await supabase
    .from("drawings")
    .update({ review_status: status })
    .eq("id", drawingId);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Access grants                                                       */
/* ------------------------------------------------------------------ */

/** The discipline seats a document can be routed to. */
export const GRANTABLE_ROLES: AppRole[] = [
  "architect",
  "qs",
  "interior_designer",
  "mep_engineer",
  "procurement",
  "china_sourcing",
];

export type AccessGrant = {
  id: string;
  drawing_id: string;
  grantee_role: AppRole | null;
  grantee_user_id: string | null;
  created_at: string;
};

export async function listAccessGrants(projectId: string): Promise<AccessGrant[]> {
  const { data, error } = await supabase
    .from("document_access_grants")
    .select("id, drawing_id, grantee_role, grantee_user_id, created_at")
    .eq("project_id", projectId);
  if (error) throw error;
  return data ?? [];
}

export async function grantAccess(input: {
  drawingId: string;
  projectId: string;
  role?: AppRole | undefined;
  userId?: string | undefined;
}) {
  if (!input.role === !input.userId) throw new Error("Choose a seat or a person.");
  const { error } = await supabase.from("document_access_grants").insert({
    drawing_id: input.drawingId,
    project_id: input.projectId,
    grantee_role: input.role ?? null,
    grantee_user_id: input.userId ?? null,
  });
  if (error) {
    if (error.code === "23505") throw new Error("They already have access to this document.");
    throw error;
  }
}

export async function revokeAccess(grantId: string) {
  const { error } = await supabase.from("document_access_grants").delete().eq("id", grantId);
  if (error) throw error;
}

export async function setDocumentRestricted(drawingId: string, restricted: boolean) {
  const { error } = await supabase
    .from("drawings")
    .update({ access_restricted: restricted })
    .eq("id", drawingId);
  if (error) throw error;
}

export type ProjectMember = { user_id: string; role: string; name: string };

export async function listProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("user_id, role")
    .eq("project_id", projectId);
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((m) => m.user_id))];
  if (ids.length === 0) return [];
  const { data: people, error: pErr } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);
  if (pErr) throw pErr;
  return (data ?? []).map((m) => {
    const p = (people ?? []).find((x) => x.id === m.user_id);
    return {
      user_id: m.user_id,
      role: m.role as string,
      name: p?.full_name || p?.email || "Team member",
    };
  });
}

/* ------------------------------------------------------------------ */
/* Design board                                                        */
/* ------------------------------------------------------------------ */

export type ShowcaseItem = {
  id: string;
  category: string;
  name: string;
  description: string | null;
  unit: string;
  image_url: string | null;
  model_url: string | null;
  swatch_hex: string | null;
};

/** Products UZA chose to show clients — name, picture, 3D link, swatch. Never a price. */
export async function listShowcaseItems(): Promise<ShowcaseItem[]> {
  const { data, error } = await supabase.rpc("client_showcase_items");
  if (error) throw error;
  return data ?? [];
}

export type ProjectRoom = { id: string; name: string; room_type: string | null };

export async function listProjectRooms(projectId: string): Promise<ProjectRoom[]> {
  const { data, error } = await supabase
    .from("rooms")
    .select("id, name, room_type")
    .eq("project_id", projectId)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export const SELECTION_KINDS = ["product", "colour", "reference", "idea"] as const;
export type SelectionKind = (typeof SELECTION_KINDS)[number];

export const SELECTION_KIND_LABELS: Record<SelectionKind, string> = {
  product: "Product",
  colour: "Colour",
  reference: "Reference picture",
  idea: "Idea",
};

export const SELECTION_STATUSES = [
  "proposed",
  "in_review",
  "accepted",
  "customised",
  "declined",
] as const;
export type SelectionStatus = (typeof SELECTION_STATUSES)[number];

export const SELECTION_STATUS_LABELS: Record<SelectionStatus, string> = {
  proposed: "Proposed",
  in_review: "Team is reviewing",
  accepted: "Accepted",
  customised: "Customised by the team",
  declined: "Not possible",
};

export function selectionStatusLabel(status: string): string {
  return SELECTION_STATUS_LABELS[status as SelectionStatus] ?? status;
}

export type ClientSelection = {
  id: string;
  project_id: string;
  room_id: string | null;
  area_label: string | null;
  kind: string;
  catalog_item_id: string | null;
  title: string;
  colour_hex: string | null;
  notes: string | null;
  attachment_path: string | null;
  status: string;
  team_response: string | null;
  alternative_title: string | null;
  alternative_item_id: string | null;
  responded_by_name: string | null;
  responded_at: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
};

export async function listSelections(projectId: string): Promise<ClientSelection[]> {
  const { data, error } = await supabase
    .from("client_selections")
    .select(
      "id, project_id, room_id, area_label, kind, catalog_item_id, title, colour_hex, notes, attachment_path, status, team_response, alternative_title, alternative_item_id, responded_by_name, responded_at, created_by, created_by_name, created_at",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createSelection(input: {
  projectId: string;
  kind: SelectionKind;
  title: string;
  roomId?: string | null;
  areaLabel?: string | null;
  catalogItemId?: string | null;
  colourHex?: string | null;
  notes?: string | null;
  attachment?: File | null;
}) {
  const title = input.title.trim();
  if (!title) throw new Error("Give your proposal a short name.");
  let attachmentPath: string | null = null;
  if (input.attachment) {
    if (
      !input.attachment.type.startsWith("image/") &&
      input.attachment.type !== "application/pdf"
    ) {
      throw new Error("Attach a picture or a PDF.");
    }
    if (input.attachment.size > 20 * 1024 * 1024)
      throw new Error("Attachments are limited to 20 MB.");
    attachmentPath = `${input.projectId}/selections/${crypto.randomUUID()}.${extensionOf(input.attachment.name)}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(attachmentPath, input.attachment);
    if (upErr) throw upErr;
  }
  const { error } = await supabase.from("client_selections").insert({
    project_id: input.projectId,
    kind: input.kind,
    title: title.slice(0, 200),
    room_id: input.roomId || null,
    area_label: input.areaLabel?.trim() || null,
    catalog_item_id: input.catalogItemId || null,
    colour_hex: input.colourHex || null,
    notes: input.notes?.trim() || null,
    attachment_path: attachmentPath,
  });
  if (error) {
    if (attachmentPath) await supabase.storage.from(BUCKET).remove([attachmentPath]);
    throw error;
  }
}

export async function deleteSelection(selection: Pick<ClientSelection, "id" | "attachment_path">) {
  const { error } = await supabase.from("client_selections").delete().eq("id", selection.id);
  if (error) throw error;
  if (selection.attachment_path)
    await supabase.storage.from(BUCKET).remove([selection.attachment_path]);
}

/** The design team's answer to a proposal. */
export async function respondToSelection(input: {
  id: string;
  status: SelectionStatus;
  response?: string | null;
  alternativeTitle?: string | null;
  alternativeItemId?: string | null;
}) {
  if ((input.status === "customised" || input.status === "declined") && !input.response?.trim()) {
    throw new Error("Tell the client what you changed, or why it is not possible.");
  }
  const { error } = await supabase
    .from("client_selections")
    .update({
      status: input.status,
      team_response: input.response?.trim() || null,
      alternative_title: input.alternativeTitle?.trim() || null,
      alternative_item_id: input.alternativeItemId || null,
    })
    .eq("id", input.id);
  if (error) throw error;
}
