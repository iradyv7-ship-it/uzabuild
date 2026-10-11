/**
 * Reads for a factory's own workspace.
 *
 * A factory account reaches its work only through supplier_packages() and
 * supplier_me() (20261011090000): package code, product family, tier,
 * delivery date, its own status and the RFQ UZA sent it. It cannot read the
 * package row, the project, the client, the budget or another factory — the
 * database returns nothing, so there is nothing here to filter.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

const BUCKET = "drawings";

export type SupplierPackage =
  Database["public"]["Functions"]["supplier_packages"]["Returns"][number];

export async function getSupplierMe(): Promise<{
  supplier_id: string;
  supplier_name: string;
} | null> {
  const { data, error } = await supabase.rpc("supplier_me");
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function listSupplierPackages(): Promise<SupplierPackage[]> {
  const { data, error } = await supabase.rpc("supplier_packages");
  if (error) throw error;
  return [...(data ?? [])].sort((a, b) => b.rfq_sent_at.localeCompare(a.rfq_sent_at));
}

export type ReleasedFile = {
  id: string;
  file_name: string;
  kind: string;
  caption: string | null;
  storage_path: string;
  created_at: string;
};

/**
 * Files UZA released to the factories on this package. RLS returns only
 * released general files and the factory's own uploads; the own uploads are
 * dropped here because they appear with the factory's quote.
 */
export async function listReleasedFiles(packageId: string): Promise<ReleasedFile[]> {
  const { data, error } = await supabase
    .from("package_attachments")
    .select("id, file_name, kind, caption, storage_path, created_at, uploaded_for_supplier_id")
    .eq("package_id", packageId)
    .is("uploaded_for_supplier_id", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(({ uploaded_for_supplier_id: _own, ...rest }) => rest);
}

export async function downloadFile(storagePath: string, name: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error || !data) throw error ?? new Error("Could not open that file · 无法打开该文件");
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = name;
  a.target = "_blank";
  a.rel = "noopener";
  a.click();
}

/** Package status as the factory sees it (supplier_packages().shortlist_status). */
export const SUPPLIER_STATUS_LABELS: Record<string, string> = {
  open: "Open for quotation · 报价中",
  selected: "Selected · 已中标",
  closed: "Closed · 已结束",
};
