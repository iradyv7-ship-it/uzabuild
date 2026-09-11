/**
 * Public site reads and writes.
 *
 * Portfolio entries are the only project information UZA shows publicly, and
 * an entry is only visible once someone has explicitly published it. Whether
 * the client is named at all is a separate, deliberate flag — an unconsented
 * project is shown anonymously ("A 240-key hotel in Kigali") or not at all.
 */
import { supabase } from "@/integrations/supabase/client";

export type PortfolioEntry = {
  id: string;
  slug: string;
  title: string;
  client_display_name: string | null;
  client_consented: boolean;
  location: string | null;
  country: string;
  project_type: string;
  year: number | null;
  status: "ongoing" | "completed";
  summary: string;
  scope: string;
  product_families: string[];
  quality_tier: string | null;
  cover_url: string | null;
  gallery_urls: string[];
  sort_order: number;
  is_published: boolean;
  project_id: string | null;
};

export const PROJECT_TYPES = [
  { value: "conference", label: "Conference & public halls" },
  { value: "hotel", label: "Hotels & hospitality" },
  { value: "apartment", label: "Apartments & residences" },
  { value: "residence", label: "Private homes" },
  { value: "commercial", label: "Commercial & office" },
  { value: "institutional", label: "Institutional" },
  { value: "other", label: "Other" },
] as const;

export function projectTypeLabel(value: string) {
  return PROJECT_TYPES.find((t) => t.value === value)?.label ?? value;
}

/** How an entry may be attributed in public. Consent governs the client name. */
export function displayClient(e: Pick<PortfolioEntry, "client_consented" | "client_display_name">) {
  return e.client_consented && e.client_display_name ? e.client_display_name : "Client withheld";
}

export async function listPublishedEntries(): Promise<PortfolioEntry[]> {
  const { data, error } = await supabase
    .from("portfolio_entries")
    .select("*")
    .eq("is_published", true)
    .order("sort_order")
    .order("year", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PortfolioEntry[];
}

export async function getPublishedEntry(slug: string): Promise<PortfolioEntry | null> {
  const { data, error } = await supabase
    .from("portfolio_entries")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (error) throw error;
  return (data as PortfolioEntry) ?? null;
}

/** Staff view: drafts included. RLS restricts this to Admin / Project Manager. */
export async function listAllEntries(): Promise<PortfolioEntry[]> {
  const { data, error } = await supabase
    .from("portfolio_entries")
    .select("*")
    .order("sort_order")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PortfolioEntry[];
}

export type EntryDraft = Partial<PortfolioEntry> & { slug: string; title: string };

export async function upsertEntry(draft: EntryDraft) {
  const { id, ...rest } = draft;
  if (id) {
    const { error } = await supabase.from("portfolio_entries").update(rest).eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("portfolio_entries").insert(rest as never);
  if (error) throw error;
}

export async function deleteEntry(id: string) {
  const { error } = await supabase.from("portfolio_entries").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Enquiries                                                           */
/* ------------------------------------------------------------------ */

export type EnquiryInput = {
  contact_name: string;
  company?: string;
  email: string;
  phone?: string;
  project_type: string;
  location?: string;
  scale?: string;
  target_date?: string | null;
  quality_tier?: string;
  budget_band?: string;
  brief?: string;
};

export const BUDGET_BANDS = [
  "Under USD 50,000",
  "USD 50,000 – 150,000",
  "USD 150,000 – 500,000",
  "USD 500,000 – 1,500,000",
  "Above USD 1,500,000",
  "Not yet defined",
] as const;

export async function submitEnquiry(input: EnquiryInput) {
  const { error } = await supabase.from("project_enquiries").insert({
    ...input,
    target_date: input.target_date || null,
  } as never);
  if (error) throw error;
}

export async function listEnquiries() {
  const { data, error } = await supabase
    .from("project_enquiries")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
