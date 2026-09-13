import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkForForeignBranding, type ForeignBrandingCheck } from "@/lib/confidentiality";

function validate(input: unknown): { text: string } {
  const value = input as Partial<{ text: string }>;
  if (!value || typeof value.text !== "string" || value.text.trim().length === 0) {
    throw new Error("Nothing to verify.");
  }
  return { text: value.text.slice(0, 20000) };
}

/**
 * Scans SYSTEM-GENERATED client-facing text (a proforma, a translated BOQ)
 * for any known non-UZA identifier: every manufacturer/supplier name
 * (queried live from `suppliers`, never a hardcoded list — a factory added
 * next week is covered automatically), Cecilia's own name and contact
 * details (queried from `role_bootstrap_emails`, the same row that seeds her
 * seat), and every other supplier's contact name/email/phone.
 *
 * Uses supabaseAdmin deliberately: this is an internal compliance check that
 * needs the FULL supplier directory regardless of the caller's own RLS
 * visibility (e.g. a QS issuing a proforma may not otherwise see every
 * supplier row) — it never returns the underlying rows, only whether a match
 * was found and which business names matched, which is not confidential in
 * itself (the whole point is that these names must never reach the client).
 *
 * Called automatically before a proforma or translated BOQ may be marked
 * issued/client-visible (see ProformaPanel.tsx's issue mutation); a real
 * database trigger (`block_foreign_branding_on_issue`, in the same migration
 * as `drawings.client_visible`) is the hard backstop for proformas so a
 * direct write cannot skip this check either.
 */
export const verifyNoForeignBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data }): Promise<ForeignBrandingCheck> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [suppliers, ceciliaSeats] = await Promise.all([
      supabaseAdmin.from("suppliers").select("name, contact_name, email, phone"),
      supabaseAdmin
        .from("role_bootstrap_emails")
        .select("email, full_name")
        .eq("role", "china_sourcing"),
    ]);

    const knownNames: (string | null | undefined)[] = [];
    for (const s of suppliers.data ?? []) {
      knownNames.push(s.name, s.contact_name, s.email, s.phone);
    }
    for (const c of ceciliaSeats.data ?? []) {
      knownNames.push(c.full_name, c.email);
    }

    return checkForForeignBranding(data.text, knownNames);
  });
