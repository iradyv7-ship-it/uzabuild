/**
 * Reads for the client portal.
 *
 * Every query here is written for a client seat: project status, recorded
 * sign-offs and formally issued proformas at the agreed price. No catalog
 * rate, no supplier, no margin, no cost build-up. The database enforces the
 * same rule, so an edit here cannot accidentally expose cost.
 */
import { supabase } from "@/integrations/supabase/client";

export type PortalProject = {
  id: string;
  name: string;
  client_name: string | null;
  location: string | null;
  current_stage: string;
  created_at: string;
};

export async function listPortalProjects(): Promise<PortalProject[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, client_name, location, current_stage, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPortalProject(projectId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, client_name, location, current_stage, target_completion")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listIssuedProformas() {
  const { data, error } = await supabase
    .from("proformas")
    .select("id, project_id, reference, title, status, issued_at, signed_by_name, signed_by_title")
    .eq("status", "issued")
    .order("issued_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listProjectProformas(projectId: string) {
  const { data, error } = await supabase
    .from("proformas")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "issued")
    .order("issued_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listRecentApprovals(limit = 8) {
  const { data, error } = await supabase
    .from("approvals")
    .select("id, project_id, role, stage, approver_name, approved_at")
    .order("approved_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listProjectApprovals(projectId: string) {
  const { data, error } = await supabase
    .from("approvals")
    .select("id, role, stage, approver_name, approved_at")
    .eq("project_id", projectId)
    .order("approved_at");
  if (error) throw error;
  return data ?? [];
}

/** Client-safe proforma lines: the agreed USD price only, never the RMB cost. */
export async function listProformaLines(proformaId: string) {
  const { data, error } = await supabase
    .from("proforma_lines")
    .select("id, description, specification, unit, quantity, unit_price_usd_minor")
    .eq("proforma_id", proformaId)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function getProformaClient(clientId: string) {
  const { data, error } = await supabase
    .from("clients")
    .select(
      "name, contact_name, company_registration, tin, address, city, country, billing_email, email, phone",
    )
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
