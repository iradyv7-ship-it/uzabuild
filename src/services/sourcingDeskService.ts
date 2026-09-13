/**
 * Cecilia's workspace ("china_sourcing"'s dedicated landing view — task 3).
 *
 * Every query here relies on the broad sourcing visibility granted in
 * 20260913130000 (`can_access_project_sourcing`, used by the RLS on
 * proformas/drawings) — so these return rows across every active project,
 * not just ones she has been explicitly invited to. Real queries against
 * real tables; nothing here is placeholder content.
 */
import { supabase } from "@/integrations/supabase/client";

export type DraftProformaRow = {
  id: string;
  reference: string;
  title: string;
  status: string;
  created_at: string;
  project_id: string;
  lineCount: number;
  projects: { name: string; project_code: string | null } | null;
};

/** Draft (or issued-but-unsigned) proformas across every active project — her input is what turns a draft into something UZA can send. */
export async function listProformasAwaitingInput(): Promise<DraftProformaRow[]> {
  const { data, error } = await supabase
    .from("proformas")
    .select("id, reference, title, status, created_at, project_id, projects(name, project_code), proforma_lines(id)")
    .neq("status", "issued")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    reference: p.reference,
    title: p.title,
    status: p.status,
    created_at: p.created_at,
    project_id: p.project_id,
    projects: p.projects as { name: string; project_code: string | null } | null,
    lineCount: Array.isArray(p.proforma_lines) ? p.proforma_lines.length : 0,
  }));
}

export type UnacknowledgedDocumentRow = {
  id: string;
  file_name: string;
  document_kind: string;
  created_at: string;
  project_id: string;
  uploaded_by: string | null;
  projects: { name: string; project_code: string | null } | null;
};

/**
 * Drawings/documents uploaded by someone else, in the last 30 days, that
 * this user (Cecilia) has not yet acknowledged. Excludes her own uploads —
 * acknowledging your own upload is meaningless.
 */
export async function listUnacknowledgedDocuments(userId: string): Promise<UnacknowledgedDocumentRow[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: drawings, error: drawingsError }, { data: acks, error: acksError }] = await Promise.all([
    supabase
      .from("drawings")
      .select("id, file_name, document_kind, created_at, project_id, uploaded_by, projects(name, project_code)")
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
    supabase.from("document_acknowledgements").select("drawing_id").eq("user_id", userId),
  ]);
  if (drawingsError) throw drawingsError;
  if (acksError) throw acksError;

  const acknowledged = new Set((acks ?? []).map((a) => a.drawing_id));
  return (drawings ?? [])
    .filter((d) => d.uploaded_by !== userId && !acknowledged.has(d.id))
    .map((d) => ({
      id: d.id,
      file_name: d.file_name,
      document_kind: d.document_kind,
      created_at: d.created_at,
      project_id: d.project_id,
      uploaded_by: d.uploaded_by,
      projects: d.projects as { name: string; project_code: string | null } | null,
    }));
}

export async function acknowledgeDocument(drawingId: string, projectId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("document_acknowledgements")
    .upsert({ drawing_id: drawingId, project_id: projectId, user_id: userId }, { onConflict: "drawing_id,user_id" });
  if (error) throw error;
}

export type PackageNeedingReviewRow = {
  id: string;
  title: string;
  package_code: string | null;
  status: string;
  project_id: string;
  projects: { name: string; project_code: string | null } | null;
};

/** Packages in an active sourcing state (shortlisted/RFQ sent/quoted) — the factory-quote pipeline waiting on her review before a proforma is built from it. */
export async function listPackagesNeedingSourcingReview(): Promise<PackageNeedingReviewRow[]> {
  const { data, error } = await supabase
    .from("product_packages")
    .select("id, title, package_code, status, project_id, projects(name, project_code)")
    .in("status", ["ready_to_source", "sourcing", "quoted"])
    .order("priority", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PackageNeedingReviewRow[];
}
