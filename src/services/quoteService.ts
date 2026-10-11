/**
 * Factory quotations: one factory's price for one package.
 *
 * Shared by both sides of the wall. A factory account calls these from the
 * supplier workspace and the database forces every row to its own supplier
 * (20261011090000: guard_factory_quote, can_read_quote / can_edit_quote); UZA
 * staff call them from the package to record a quote that arrived by email
 * and to compare and decide. Clients have no policy on any of these tables.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type FactoryQuote = Database["public"]["Tables"]["factory_quotes"]["Row"];
export type FactoryQuoteLine = Database["public"]["Tables"]["factory_quote_lines"]["Row"];

const BUCKET = "drawings";
const MAX_QUOTE_BYTES = 18 * 1024 * 1024;

/** Statuses as both sides see them. The factory reads these labels too. */
export const QUOTE_STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted · 已提交",
  parsed: "Received · 已接收",
  withdrawn: "Withdrawn · 已撤回",
  under_review: "Under review · 审核中",
  shortlisted: "Shortlisted · 入围",
  selected: "Selected · 已选中",
  rejected: "Not retained · 未入选",
};

export function quoteStatusLabel(status: string): string {
  return QUOTE_STATUS_LABELS[status] ?? status;
}

/** Statuses only UZA can set. */
export const DECISION_STATUSES = ["under_review", "shortlisted", "selected", "rejected"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export async function listQuotes(packageId: string): Promise<FactoryQuote[]> {
  const { data, error } = await supabase
    .from("factory_quotes")
    .select("*")
    .eq("package_id", packageId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listQuoteLines(quoteId: string): Promise<FactoryQuoteLine[]> {
  const { data, error } = await supabase
    .from("factory_quote_lines")
    .select("*")
    .eq("quote_id", quoteId)
    .order("line_no");
  if (error) throw error;
  return data ?? [];
}

/** Lines for several quotes at once (the comparison matrix). */
export async function listLinesForQuotes(quoteIds: string[]): Promise<FactoryQuoteLine[]> {
  if (quoteIds.length === 0) return [];
  const { data, error } = await supabase
    .from("factory_quote_lines")
    .select("*")
    .in("quote_id", quoteIds)
    .order("line_no");
  if (error) throw error;
  return data ?? [];
}

function safeFileName(name: string) {
  return name.replace(/[^\w.-]+/g, "_").slice(-120) || "quote";
}

export async function submitQuote(input: {
  packageId: string;
  projectId: string;
  supplierId: string;
  file: File | null;
  currency: "CNY" | "USD" | "RWF";
  incoterm?: string | null | undefined;
  leadTimeDays?: number | null | undefined;
  moqNote?: string | null | undefined;
  validUntil?: string | null | undefined;
  paymentTerms?: string | null | undefined;
  sampleAvailable?: boolean | null | undefined;
  notes?: string | null | undefined;
}): Promise<{ quoteId: string }> {
  let path: string | null = null;
  if (input.file) {
    if (input.file.size > MAX_QUOTE_BYTES) {
      throw new Error("The quotation file is larger than 18 MB — send a smaller PDF or split it.");
    }
    path = `${input.projectId}/packages/${input.packageId}/supplier-${input.supplierId}/${crypto.randomUUID()}-${safeFileName(input.file.name)}`;
    const { error: upError } = await supabase.storage.from(BUCKET).upload(path, input.file);
    if (upError) throw upError;
  }

  const lead = input.leadTimeDays;
  const { data, error } = await supabase
    .from("factory_quotes")
    .insert({
      package_id: input.packageId,
      // Set by the database from the package; sent only to satisfy the type.
      project_id: input.projectId,
      supplier_id: input.supplierId,
      currency: input.currency,
      incoterm: input.incoterm?.trim() || null,
      lead_time_days:
        typeof lead === "number" && Number.isFinite(lead) ? Math.max(0, Math.round(lead)) : null,
      moq_note: input.moqNote?.trim() || null,
      valid_until: input.validUntil || null,
      payment_terms: input.paymentTerms?.trim() || null,
      sample_available: input.sampleAvailable ?? null,
      notes: input.notes?.trim() || null,
      file_name: input.file?.name ?? null,
      attachment_path: path,
    })
    .select("id")
    .single();
  if (error) {
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return { quoteId: data.id };
}

export async function updateQuoteLine(
  id: string,
  patch: {
    quantity?: number | null;
    unit_price_minor?: number | null;
    unit?: string | null;
    description?: string;
  },
): Promise<void> {
  const { error } = await supabase.from("factory_quote_lines").update(patch).eq("id", id);
  if (error) throw error;
}

/** Re-totals a quote after a line was edited by hand. */
export async function refreshQuoteTotal(quoteId: string): Promise<void> {
  const lines = await listQuoteLines(quoteId);
  let total = 0;
  let any = false;
  for (const l of lines) {
    if (l.quantity !== null && l.unit_price_minor !== null) {
      total += Math.round(Number(l.quantity) * l.unit_price_minor);
      any = true;
    }
  }
  const { error } = await supabase
    .from("factory_quotes")
    .update({ total_minor: any ? total : null })
    .eq("id", quoteId);
  if (error) throw error;
}

export async function withdrawQuote(quoteId: string): Promise<void> {
  const { error } = await supabase
    .from("factory_quotes")
    .update({ status: "withdrawn" })
    .eq("id", quoteId);
  if (error) throw error;
}

/** UZA's decision on a quote. The database stamps who decided and when. */
export async function decideQuote(quoteId: string, status: DecisionStatus): Promise<void> {
  const { error } = await supabase.from("factory_quotes").update({ status }).eq("id", quoteId);
  if (error) throw error;
}

export async function openQuoteFile(path: string, name: string): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data) throw error ?? new Error("Could not open that file.");
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = name;
  a.target = "_blank";
  a.rel = "noopener";
  a.click();
}

/** The RFQs UZA has sent on a package (staff see all; a factory sees its own). */
export async function listPackageRfqs(packageId: string) {
  const { data, error } = await supabase
    .from("package_rfqs")
    .select("id, package_id, supplier_id, reference, schedule, sent_at, sent_by_name")
    .eq("package_id", packageId)
    .order("sent_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
