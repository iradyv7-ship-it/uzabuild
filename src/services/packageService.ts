/**
 * Reads and writes for project sourcing packages.
 *
 * All access rules are enforced by the database (internal seats on the project
 * only). This module keeps the queries in one place so the panels stay purely
 * presentational.
 */
import { supabase } from "@/integrations/supabase/client";
import { PACKAGE_REQUIREMENTS } from "@/config/packages";

export type ProductPackage = {
  id: string;
  project_id: string;
  package_code: string | null;
  seq: number;
  category: string;
  title: string;
  scope_note: string | null;
  quality_tier: string;
  priority: number;
  phase: number;
  phase_note: string | null;
  target_budget_minor: number | null;
  budget_currency: string;
  required_delivery_date: string | null;
  style_note: string | null;
  colour_note: string | null;
  shape_note: string | null;
  pattern_note: string | null;
  texture_note: string | null;
  finish_note: string | null;
  performance_note: string | null;
  status: string;
  created_at: string;
};

export type PackageRequirementRow = {
  id: string;
  package_id: string;
  requirement_key: string;
  owner_party: string;
  status: string;
  note: string | null;
};

export type PackageAttachment = {
  id: string;
  package_id: string;
  requirement_key: string | null;
  kind: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  caption: string | null;
  created_at: string;
};

export type PackageManufacturer = {
  id: string;
  package_id: string;
  supplier_id: string;
  status: string;
  note: string | null;
  confirmed_at: string | null;
  deposit_paid_at: string | null;
  deposit_amount_minor: number | null;
  deposit_currency: string;
  production_started_at: string | null;
  expected_ship_date: string | null;
};

export async function listPackages(projectId: string): Promise<ProductPackage[]> {
  const { data, error } = await supabase
    .from("product_packages")
    .select("*")
    .eq("project_id", projectId)
    .order("priority")
    .order("seq");
  if (error) throw error;
  return (data ?? []) as ProductPackage[];
}

export async function createPackage(input: {
  projectId: string;
  category: string;
  title: string;
  qualityTier: string;
  priority: number;
  phase?: number;
  scopeNote?: string;
  requiredDeliveryDate?: string | null;
  userId?: string | null;
}) {
  const { data, error } = await supabase
    .from("product_packages")
    .insert({
      project_id: input.projectId,
      category: input.category,
      title: input.title,
      quality_tier: input.qualityTier,
      priority: input.priority,
      phase: input.phase ?? 1,
      scope_note: input.scopeNote || null,
      required_delivery_date: input.requiredDeliveryDate || null,
      created_by: input.userId ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  // The checklist is the point of the package — create it with the package so
  // nobody has to remember to "start" it.
  const rows = PACKAGE_REQUIREMENTS.map((r) => ({
    package_id: data.id,
    project_id: input.projectId,
    requirement_key: r.key,
    owner_party: r.owner,
    status: "missing",
  }));
  const { error: reqError } = await supabase.from("package_requirements").insert(rows);
  if (reqError) throw reqError;
  return data.id as string;
}

export type PackagePatch = Partial<
  Pick<
    ProductPackage,
    | "title"
    | "scope_note"
    | "quality_tier"
    | "priority"
    | "phase"
    | "phase_note"
    | "status"
    | "required_delivery_date"
    | "target_budget_minor"
    | "style_note"
    | "colour_note"
    | "shape_note"
    | "pattern_note"
    | "texture_note"
    | "finish_note"
    | "performance_note"
  >
> & { budget_currency?: "RWF" | "USD" | "CNY" };

export async function updatePackage(packageId: string, patch: PackagePatch) {
  const { error } = await supabase.from("product_packages").update(patch).eq("id", packageId);
  if (error) throw error;
}

export async function listRequirements(projectId: string): Promise<PackageRequirementRow[]> {
  const { data, error } = await supabase
    .from("package_requirements")
    .select("id, package_id, requirement_key, owner_party, status, note")
    .eq("project_id", projectId);
  if (error) throw error;
  return (data ?? []) as PackageRequirementRow[];
}

export async function updateRequirement(
  id: string,
  patch: { status?: string; note?: string | null; owner_party?: string },
  userId?: string | null,
) {
  const { error } = await supabase
    .from("package_requirements")
    .update({ ...patch, updated_by: userId ?? null })
    .eq("id", id);
  if (error) throw error;
}

export async function listAttachments(projectId: string): Promise<PackageAttachment[]> {
  const { data, error } = await supabase
    .from("package_attachments")
    .select("id, package_id, requirement_key, kind, file_name, storage_path, mime_type, size_bytes, caption, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PackageAttachment[];
}

export async function uploadPackageFile(input: {
  projectId: string;
  packageId: string;
  requirementKey: string | null;
  kind: string;
  file: File;
  caption?: string;
  userId?: string | null;
}) {
  const safeName = input.file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${input.projectId}/packages/${input.packageId}/${Date.now()}-${safeName}`;
  const { error: upError } = await supabase.storage.from("drawings").upload(path, input.file);
  if (upError) throw upError;

  const { error } = await supabase.from("package_attachments").insert({
    package_id: input.packageId,
    project_id: input.projectId,
    requirement_key: input.requirementKey,
    kind: input.kind,
    file_name: input.file.name,
    storage_path: path,
    mime_type: input.file.type || null,
    size_bytes: input.file.size,
    caption: input.caption || null,
    uploaded_by: input.userId ?? null,
  });
  if (error) throw error;
}

export async function signedFileUrl(path: string) {
  const { data, error } = await supabase.storage.from("drawings").createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteAttachment(id: string) {
  const { error } = await supabase.from("package_attachments").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- manufacturers ---------------- */

export type SupplierCoverage = {
  id: string;
  supplier_id: string;
  category: string;
  quality_tier: string;
  is_preferred: boolean;
  lead_time_days: number | null;
  note: string | null;
  suppliers: { id: string; name: string; country: string; is_active: boolean } | null;
};

export async function listSupplierCoverage(): Promise<SupplierCoverage[]> {
  const { data, error } = await supabase
    .from("supplier_categories")
    .select("id, supplier_id, category, quality_tier, is_preferred, lead_time_days, note, suppliers(id, name, country, is_active)")
    .order("category");
  if (error) throw error;
  return (data ?? []) as unknown as SupplierCoverage[];
}

export async function listPackageManufacturers(projectId: string): Promise<PackageManufacturer[]> {
  const { data, error } = await supabase
    .from("package_manufacturers")
    .select(
      "id, package_id, supplier_id, status, note, confirmed_at, deposit_paid_at, deposit_amount_minor, deposit_currency, production_started_at, expected_ship_date",
    )
    .eq("project_id", projectId);
  if (error) throw error;
  return (data ?? []) as PackageManufacturer[];
}

export async function shortlistManufacturer(input: {
  projectId: string;
  packageId: string;
  supplierId: string;
  userId?: string | null;
}) {
  const { error } = await supabase.from("package_manufacturers").insert({
    project_id: input.projectId,
    package_id: input.packageId,
    supplier_id: input.supplierId,
    created_by: input.userId ?? null,
  });
  if (error) throw error;
}

export async function setManufacturerStatus(id: string, status: string) {
  const { error } = await supabase.from("package_manufacturers").update({ status }).eq("id", id);
  if (error) throw error;
}

/**
 * The factory commitment record: confirmed, paid, in production, shipping.
 * This is what turns "I will pay them Monday" into something the whole team
 * can see without asking.
 */
export type ManufacturerCommitment = Partial<
  Pick<
    PackageManufacturer,
    | "confirmed_at"
    | "deposit_paid_at"
    | "deposit_amount_minor"
    | "production_started_at"
    | "expected_ship_date"
    | "note"
  >
> & { deposit_currency?: "RWF" | "USD" | "CNY" };

export async function setManufacturerCommitment(id: string, patch: ManufacturerCommitment) {
  const { error } = await supabase.from("package_manufacturers").update(patch).eq("id", id);
  if (error) throw error;
}

export async function removeManufacturer(id: string) {
  const { error } = await supabase.from("package_manufacturers").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- readiness ---------------- */

export type Readiness = {
  provided: number;
  total: number;
  blockers: string[];
  ready: boolean;
};

/** A package is ready to source only when every blocking item is provided. */
export function readiness(rows: PackageRequirementRow[]): Readiness {
  const counted = PACKAGE_REQUIREMENTS.map((r) => ({
    def: r,
    row: rows.find((x) => x.requirement_key === r.key),
  }));
  const answered = counted.filter(
    (c) => c.row?.status === "provided" || c.row?.status === "not_applicable",
  ).length;
  const blockers = counted
    .filter((c) => c.def.blocksSourcing && c.row?.status !== "provided" && c.row?.status !== "not_applicable")
    .map((c) => c.def.label);
  return { provided: answered, total: counted.length, blockers, ready: blockers.length === 0 };
}

/* ---------------- cross-project board ---------------- */

export type BoardPackage = ProductPackage & {
  projects: { id: string; name: string; project_code: string | null } | null;
};

/**
 * Every package across every project the signed-in seat can see.
 * Four urgent projects at once is exactly the case this exists for.
 */
export async function listAllPackages(): Promise<BoardPackage[]> {
  const { data, error } = await supabase
    .from("product_packages")
    .select("*, projects(id, name, project_code)")
    .order("phase")
    .order("priority");
  if (error) throw error;
  return (data ?? []) as unknown as BoardPackage[];
}

export async function listAllRequirements(): Promise<PackageRequirementRow[]> {
  const { data, error } = await supabase
    .from("package_requirements")
    .select("id, package_id, requirement_key, owner_party, status, note");
  if (error) throw error;
  return (data ?? []) as PackageRequirementRow[];
}
